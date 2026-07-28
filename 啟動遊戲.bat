@echo off
setlocal

set "GAME_LAUNCHER=%~dp0scripts\start-game.ps1"

if not exist "%GAME_LAUNCHER%" (
  powershell.exe -NoProfile -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('The game launcher file is missing.','Echoes Beyond the Stars') | Out-Null"
  exit /b 1
)

start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%GAME_LAUNCHER%"
exit /b 0
