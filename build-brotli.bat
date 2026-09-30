@echo off
call "%~dp0builders\brotli\build.bat" %*
exit /b %ERRORLEVEL%
