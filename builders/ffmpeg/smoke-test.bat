@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=browser-full"
node "%SCRIPT_DIR%scripts\smoke-test.mjs" "%PROFILE%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Smoke test failed.
  pause
  exit /b %RC%
)
echo.
echo Smoke test passed.
pause
endlocal
