@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0builders\jq\scripts\build.ps1" %*
