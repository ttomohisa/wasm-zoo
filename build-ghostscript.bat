@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0builders\ghostscript\scripts\build.ps1" %*
