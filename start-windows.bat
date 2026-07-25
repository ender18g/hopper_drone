@echo off
setlocal
cd /d "%~dp0"
set "STUDIO_NAME=Drone Studio"
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "(Get-Content -Raw -LiteralPath '%~dp0config\branding.json' | ConvertFrom-Json).studioName"`) do set "STUDIO_NAME=%%I"
title %STUDIO_NAME%

where node >nul 2>nul
if errorlevel 1 (
  echo %STUDIO_NAME% needs Node.js 22.13 or newer.
  echo Install the current LTS version from https://nodejs.org and run this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

node -e "const version = process.versions.node.split('.').map(Number); process.exit(Math.max(0, Math.sign(22013 - (version[0] * 1000 + version[1]))))"
if errorlevel 1 (
  echo %STUDIO_NAME% needs Node.js 22.13 or newer.
  echo Update Node.js from https://nodejs.org and run this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

if not exist node_modules (
  echo Preparing %STUDIO_NAME% for the first time...
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000' -TimeoutSec 2; if ($response.Content -match [regex]::Escape($env:STUDIO_NAME)) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 (
  echo %STUDIO_NAME% is already running.
  start "" http://localhost:3000
  exit /b 0
)

echo Starting %STUDIO_NAME%...
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3000'"
call npm run dev
if errorlevel 1 (
  echo.
  echo %STUDIO_NAME% could not start. Review the message above.
  pause
)
