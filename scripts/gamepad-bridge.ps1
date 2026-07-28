$ErrorActionPreference = "Stop"

$bridgeAddress = [System.Net.IPAddress]::Loopback
$bridgePort = 3001

Add-Type -TypeDefinition @'
using System;
using System.Globalization;
using System.Runtime.InteropServices;

public static class EchoesXInputBridge
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Gamepad
    {
        public ushort Buttons;
        public byte LeftTrigger;
        public byte RightTrigger;
        public short ThumbLX;
        public short ThumbLY;
        public short ThumbRX;
        public short ThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct State
    {
        public uint PacketNumber;
        public Gamepad Gamepad;
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    private static extern uint GetState(uint userIndex, out State state);

    public static string GetStateJson()
    {
        for (uint index = 0; index < 4; index++)
        {
            State state;
            if (GetState(index, out state) != 0)
            {
                continue;
            }

            return string.Format(
                CultureInfo.InvariantCulture,
                "{{\"connected\":true,\"source\":\"xinput\",\"index\":{0},\"packet\":{1},\"buttons\":{2},\"leftTrigger\":{3},\"rightTrigger\":{4},\"leftX\":{5},\"leftY\":{6},\"rightX\":{7},\"rightY\":{8}}}",
                index,
                state.PacketNumber,
                state.Gamepad.Buttons,
                state.Gamepad.LeftTrigger,
                state.Gamepad.RightTrigger,
                state.Gamepad.ThumbLX,
                state.Gamepad.ThumbLY,
                state.Gamepad.ThumbRX,
                state.Gamepad.ThumbRY
            );
        }

        return "{\"connected\":false,\"source\":\"xinput\"}";
    }
}
'@

function Send-HttpResponse {
    param(
        [Parameter(Mandatory = $true)]
        [System.Net.Sockets.NetworkStream]$Stream,

        [Parameter(Mandatory = $true)]
        [string]$Body,

        [int]$StatusCode = 200,

        [string]$StatusText = "OK"
    )

    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $headers = @(
        "HTTP/1.1 $StatusCode $StatusText",
        "Content-Type: application/json; charset=utf-8",
        "Content-Length: $($bodyBytes.Length)",
        "Access-Control-Allow-Origin: *",
        "Access-Control-Allow-Methods: GET, OPTIONS",
        "Access-Control-Allow-Headers: Content-Type",
        "Access-Control-Allow-Private-Network: true",
        "Cache-Control: no-store, no-cache, must-revalidate",
        "Connection: close",
        "",
        ""
    ) -join "`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($bodyBytes.Length -gt 0) {
        $Stream.Write($bodyBytes, 0, $bodyBytes.Length)
    }
    $Stream.Flush()
}

$listener = [System.Net.Sockets.TcpListener]::new($bridgeAddress, $bridgePort)
$listener.Server.SetSocketOption(
    [System.Net.Sockets.SocketOptionLevel]::Socket,
    [System.Net.Sockets.SocketOptionName]::ReuseAddress,
    $true
)

try {
    $listener.Start()

    while ($true) {
        $client = $listener.AcceptTcpClient()
        $reader = $null
        $stream = $null

        try {
            $client.NoDelay = $true
            $stream = $client.GetStream()
            $stream.ReadTimeout = 2000
            $reader = [System.IO.StreamReader]::new(
                $stream,
                [System.Text.Encoding]::ASCII,
                $false,
                1024,
                $true
            )

            $requestLine = $reader.ReadLine()
            while ($null -ne ($line = $reader.ReadLine()) -and $line.Length -gt 0) {
                # Consume the remaining request headers.
            }

            if ($requestLine -like "OPTIONS *") {
                Send-HttpResponse -Stream $stream -Body ""
            }
            elseif ($requestLine -like "GET /state *") {
                Send-HttpResponse `
                    -Stream $stream `
                    -Body ([EchoesXInputBridge]::GetStateJson())
            }
            else {
                Send-HttpResponse `
                    -Stream $stream `
                    -Body '{"error":"not_found"}' `
                    -StatusCode 404 `
                    -StatusText "Not Found"
            }
        }
        catch {
            # A cancelled browser request must not stop the bridge.
        }
        finally {
            if ($null -ne $reader) {
                $reader.Dispose()
            }
            if ($null -ne $stream) {
                $stream.Dispose()
            }
            $client.Dispose()
        }
    }
}
finally {
    $listener.Stop()
}
