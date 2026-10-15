@echo off
setlocal
set "SHIP_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined SHIP_NODE set "SHIP_NODE=%%N"
if not defined SHIP_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "SHIP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined SHIP_NODE goto missing_node
if "%~1"=="--check" goto check
if not defined PORT set "PORT=3054"
echo Keep this window open while using the preview.
echo Open the local address printed below in your browser.
"%SHIP_NODE%" "%~dp0preview\server.mjs"
if errorlevel 1 pause
exit /b
:check
"%SHIP_NODE%" --check "%~dp0preview\server.mjs"
if errorlevel 1 exit /b 1
"%SHIP_NODE%" --check "%~dp0preview\scene.js"
exit /b %errorlevel%
:missing_node
echo Node.js was not found. Ask Codex to locate its local Node.js runtime,
echo or install Node.js from its official website, then run this file again.
pause
exit /b 1
