@echo off
cd /d "%~dp0"
start "Backend" cmd /k "npm run backend"
timeout /t 3
start "Frontend" cmd /k "npm run frontend"
