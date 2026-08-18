@echo off
setlocal
cd /d "%~dp0"
set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=browser-full"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" -Profile "%PROFILE%"
if errorlevel 1 exit /b 1
endlocal
