@echo off
setlocal
cd /d "%~dp0"
set "BUS_NODE=%~dp0runtime\node.exe"
if exist "%BUS_NODE%" goto launch
where node >nul 2>nul
if errorlevel 1 goto missing
set "BUS_NODE=node"
:launch
"%BUS_NODE%" "%~dp0server.mjs" --open %*
if errorlevel 1 pause
exit /b
:missing
echo Node.js is not available. See README.md for setup.
echo Install Node.js or restore runtime\node.exe, then run this file again.
pause
exit /b 1
