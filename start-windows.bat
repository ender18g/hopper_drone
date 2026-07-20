@echo off
title Hopper Studio
where node >nul 2>nul
if errorlevel 1 (
  echo Hopper Studio needs Node.js 22 or newer.
  echo Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Preparing Hopper Studio for the first time...
  call npm install
  if errorlevel 1 pause & exit /b 1
)

start "" http://localhost:3000
call npm run dev
