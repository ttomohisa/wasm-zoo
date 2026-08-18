@echo off
setlocal
cd /d "%~dp0"
where npx >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js / npx was not found.
  echo Install Node.js, then run this file again.
  exit /b 1
)
call npm run build:site
if errorlevel 1 exit /b %errorlevel%
echo.
echo WASM Zoo: http://localhost:4173
call npx --yes serve site -l 4173
