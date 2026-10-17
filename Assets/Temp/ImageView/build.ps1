# Builds dist\ImageView.exe (Release, .NET Framework 4.8).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'ImageView.ico')) { & (Join-Path $PSScriptRoot 'tools\make-icon.ps1') }

dotnet build ImageView.csproj -c Release -nologo -v minimal
if ($LASTEXITCODE -ne 0) { throw "build failed" }

New-Item -ItemType Directory -Force 'dist' | Out-Null
Copy-Item 'bin\Release\net48\ImageView.exe' 'dist\ImageView.exe' -Force
Get-Item 'dist\ImageView.exe' | Select-Object FullName, Length
