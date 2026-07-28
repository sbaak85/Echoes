$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$gameUrl = "http://localhost:3000/"
$runtimeDirectory = Join-Path $projectRoot ".runtime"
$standardOutputLog = Join-Path $runtimeDirectory "game-server.log"
$standardErrorLog = Join-Path $runtimeDirectory "game-server-error.log"
$processIdFile = Join-Path $runtimeDirectory "game-server.pid"

function ConvertFrom-LauncherText {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EncodedText
    )

    return [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String($EncodedText)
    )
}

function Show-LauncherMessage {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    try {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show(
            $Message,
            "Echoes Beyond the Stars"
        ) | Out-Null
    }
    catch {
        # The launcher normally runs without a console, so there is no useful
        # fallback display if the Windows message box component is unavailable.
    }
}

function Test-GameReady {
    try {
        $response = Invoke-WebRequest `
            -Uri $gameUrl `
            -UseBasicParsing `
            -TimeoutSec 2

        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

try {
    if (Test-GameReady) {
        Start-Process $gameUrl
        exit 0
    }

    $bundledNode = Join-Path `
        $env:USERPROFILE `
        ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

    if (Test-Path -LiteralPath $bundledNode) {
        $nodeExecutable = $bundledNode
    }
    else {
        $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
        if ($null -eq $nodeCommand) {
            Show-LauncherMessage (ConvertFrom-LauncherText "5om+5LiN5Yiw6YGK5oiy6ZyA6KaB55qE5Z+36KGM55Kw5aKD44CC6KuL5Zue5YiwIENvZGV477yM6KuL5oiR5Y2U5Yqp5L+u5b6p5ZWf5YuV5bel5YW344CC")
            exit 1
        }

        $nodeExecutable = $nodeCommand.Source
    }

    $nodeDirectory = Split-Path -Parent $nodeExecutable
    $env:Path = "$nodeDirectory;$env:Path"

    $vinextCli = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
    if (-not (Test-Path -LiteralPath $vinextCli)) {
        Show-LauncherMessage (ConvertFrom-LauncherText "6YGK5oiy5omA6ZyA55qE5qqU5qGI5bCa5pyq5rqW5YKZ5a6M5oiQ44CC6KuL5Zue5YiwIENvZGV477yM6KuL5oiR5Y2U5Yqp5a6J6KOd5bCI5qGI5aWX5Lu244CC")
        exit 1
    }

    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

    $serverArguments = @(
        "`"$vinextCli`"",
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        "3000"
    )

    $serverProcess = Start-Process `
        -FilePath $nodeExecutable `
        -ArgumentList $serverArguments `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $standardOutputLog `
        -RedirectStandardError $standardErrorLog `
        -PassThru

    Set-Content -LiteralPath $processIdFile -Value $serverProcess.Id

    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        if (Test-GameReady) {
            Start-Process $gameUrl
            exit 0
        }

        if ($serverProcess.HasExited) {
            Show-LauncherMessage (ConvertFrom-LauncherText "6YGK5oiy5ZWf5YuV5pmC55m855Sf5ZWP6aGM44CC6KuL5Zue5YiwIENvZGV477yM6KuL5oiR5p+l55yL5ZWf5YuV57SA6YyE44CC")
            exit 1
        }

        Start-Sleep -Milliseconds 500
    }

    Show-LauncherMessage (ConvertFrom-LauncherText "6YGK5oiy5ZWf5YuV5pmC6ZaT6LaF6YGO6aCQ5pyf44CC6KuL5Zue5YiwIENvZGV477yM6KuL5oiR5p+l55yL5ZWf5YuV57SA6YyE44CC")
    exit 1
}
catch {
    Show-LauncherMessage (ConvertFrom-LauncherText "6YGK5oiy5pyq6IO95ZWf5YuV44CC6KuL5Zue5YiwIENvZGV477yM6KuL5oiR5Y2U5Yqp5qqi5p+l44CC")
    exit 1
}
