@echo off
setlocal
cd /d "%~dp0"
node "%~dp0scripts\check-repository.mjs"
if errorlevel 1 (echo.&echo Check failed.&pause&exit /b 1)
echo.&echo Checks passed.&pause
endlocal
