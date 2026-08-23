$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$gameUrl = "http://localhost:3000/"
$runtimeDirectory = Join-Path $projectRoot ".runtime"
$modulesDirectory = Join-Path $projectRoot "node_modules"
$standardOutputLog = Join-Path $runtimeDirectory "game-server.log"
$standardErrorLog = Join-Path $runtimeDirectory "game-server-error.log"
$processIdFile = Join-Path $runtimeDirectory "game-server.pid"
$gamepadBridgeUrl = "http://127.0.0.1:3001/state"
$gamepadBridgeScript = Join-Path $PSScriptRoot "gamepad-bridge.ps1"
$gamepadBridgeOutputLog = Join-Path $runtimeDirectory "gamepad-bridge.log"
$gamepadBridgeErrorLog = Join-Path $runtimeDirectory "gamepad-bridge-error.log"
$gamepadBridgeProcessIdFile = Join-Path $runtimeDirectory "gamepad-bridge.pid"

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

function Test-GamepadBridgeReady {
    try {
        $response = Invoke-WebRequest `
            -Uri $gamepadBridgeUrl `
            -UseBasicParsing `
            -TimeoutSec 1

        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Start-GamepadBridge {
    if (Test-GamepadBridgeReady) {
        return $true
    }

    if (-not (Test-Path -LiteralPath $gamepadBridgeScript)) {
        return $false
    }

    $bridgeArguments = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        "`"$gamepadBridgeScript`""
    )

    $bridgeProcess = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList $bridgeArguments `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $gamepadBridgeOutputLog `
        -RedirectStandardError $gamepadBridgeErrorLog `
        -PassThru

    Set-Content -LiteralPath $gamepadBridgeProcessIdFile -Value $bridgeProcess.Id

    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $deadline) {
        if (Test-GamepadBridgeReady) {
            return $true
        }

        if ($bridgeProcess.HasExited) {
            return $false
        }

        Start-Sleep -Milliseconds 150
    }

    return $false
}

function Install-GameDependencies {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodeExecutable
    )

    $bundledPnpmCli = Join-Path `
        $env:USERPROFILE `
        ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.mjs"

    Show-LauncherMessage (ConvertFrom-LauncherText "6aaW5qyh5ZWf5YuV5q2j5Zyo5rqW5YKZ6YGK5oiy5omA6ZyA5YWD5Lu277yM5a6M5oiQ5b6M5pyD6Ieq5YuV6ZaL5ZWf6YGK5oiy44CC6YCZ5Y+v6IO96ZyA6KaB5bm+5YiG6ZCY44CC")

    if (Test-Path -LiteralPath $bundledPnpmCli) {
        $pnpmExecutable = $NodeExecutable
        $pnpmArguments = @(
            $bundledPnpmCli,
            "install",
            "--frozen-lockfile",
            "--force",
            "--reporter",
            "append-only"
        )
    }
    else {
        $pnpmCommand = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
        if ($null -eq $pnpmCommand) {
            $pnpmCommand = Get-Command "pnpm" -ErrorAction SilentlyContinue
        }

        if ($null -eq $pnpmCommand) {
            Show-LauncherMessage (ConvertFrom-LauncherText "5om+5LiN5Yiw5aWX5Lu25rqW5YKZ5bel5YW344CC6KuL5a6J6KOdIHBucG0g5b6M5YaN6Kmm5LiA5qyh44CC")
            exit 1
        }

        $pnpmExecutable = $pnpmCommand.Source
        $pnpmArguments = @(
            "install",
            "--frozen-lockfile",
            "--force",
            "--reporter",
            "append-only"
        )
    }

    $previousCiValue = $env:CI
    $previousPnpmPmOnFailValue = $env:pnpm_config_pm_on_fail
    try {
        $env:CI = "true"
        $env:pnpm_config_pm_on_fail = "ignore"
        & $pnpmExecutable @pnpmArguments *>> $standardOutputLog
        $installExitCode = $LASTEXITCODE
    }
    finally {
        if ($null -eq $previousCiValue) {
            Remove-Item Env:CI -ErrorAction SilentlyContinue
        }
        else {
            $env:CI = $previousCiValue
        }

        if ($null -eq $previousPnpmPmOnFailValue) {
            Remove-Item Env:pnpm_config_pm_on_fail -ErrorAction SilentlyContinue
        }
        else {
            $env:pnpm_config_pm_on_fail = $previousPnpmPmOnFailValue
        }
    }

    if ($installExitCode -ne 0) {
        Show-LauncherMessage (ConvertFrom-LauncherText "54Sh5rOV6Ieq5YuV5rqW5YKZ6YGK5oiy44CC6KuL56K66KqN57ay6Lev6YCj57ea5b6M5YaN6Kmm5LiA5qyh44CC")
        exit 1
    }
}

try {
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    [void](Start-GamepadBridge)

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

    $vinextCli = Join-Path $modulesDirectory "vinext\dist\cli.js"
    if (-not (Test-Path -LiteralPath $vinextCli)) {
        if (Test-Path -LiteralPath $modulesDirectory) {
            $expectedModulesDirectory = [System.IO.Path]::GetFullPath(
                (Join-Path $projectRoot "node_modules")
            )
            $resolvedModulesDirectory = [System.IO.Path]::GetFullPath(
                $modulesDirectory
            )

            if (-not [string]::Equals(
                $resolvedModulesDirectory,
                $expectedModulesDirectory,
                [System.StringComparison]::OrdinalIgnoreCase
            )) {
                throw "Refusing to remove an unexpected modules directory."
            }

            Remove-Item -LiteralPath $resolvedModulesDirectory -Recurse -Force
        }

        Install-GameDependencies -NodeExecutable $nodeExecutable

        if (-not (Test-Path -LiteralPath $vinextCli)) {
            Show-LauncherMessage (ConvertFrom-LauncherText "6YGK5oiy5omA6ZyA55qE5qqU5qGI5bCa5pyq5rqW5YKZ5a6M5oiQ44CC6KuL5Zue5YiwIENvZGV477yM6KuL5oiR5Y2U5Yqp5a6J6KOd5bCI5qGI5aWX5Lu244CC")
            exit 1
        }
    }

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
