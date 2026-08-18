@echo off
setlocal
cd /d "%~dp0builders\ffmpeg"
call build.bat %*
