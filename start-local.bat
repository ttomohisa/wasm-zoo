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
call npm run stage:playground
if errorlevel 1 exit /b %errorlevel%
echo.
echo WASM Zoo:              http://localhost:4173
echo FFmpeg Playground:     http://localhost:4173/playground/
echo libarchive Playground: http://localhost:4173/libarchive-playground/
call npx --yes serve site -l 4173
