@echo off
setlocal
cd /d "%~dp0"
set "BUS_NODE=%~dp0runtime\node.exe"
if exist "%BUS_NODE%" goto launch
set "BUS_NODE=node"
:launch
"%BUS_NODE%" "%~dp0scripts\test.mjs"
set "BUS_EXIT=%ERRORLEVEL%"
if /i not "%~1"=="--no-pause" pause
exit /b %BUS_EXIT%
