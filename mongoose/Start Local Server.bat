@echo off
cd /d "%~dp0"
start "" "http://localhost:8000/"
mongoose.exe -l http://127.0.0.1:8000 -d .
pause
