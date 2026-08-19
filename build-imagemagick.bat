@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0builders\imagemagick\scripts\build.ps1" %*
