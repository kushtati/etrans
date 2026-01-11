@echo off
echo ========================================
echo   TransitGuinee - Demarrage
echo ========================================
echo.

REM Verifier Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Node.js n'est pas installe
    pause
    exit /b 1
)

REM Verifier PostgreSQL
powershell -Command "Get-NetTCPConnection -LocalPort 5433 -ErrorAction SilentlyContinue" >nul 2>&1
if errorlevel 1 (
    echo [AVERTISSEMENT] PostgreSQL port 5433 n'est pas actif
    echo Demarrez Docker: docker-compose up -d
    pause
)

REM Verifier Redis
powershell -Command "Get-NetTCPConnection -LocalPort 6379 -ErrorAction SilentlyContinue" >nul 2>&1
if errorlevel 1 (
    echo [AVERTISSEMENT] Redis port 6379 n'est pas actif
    echo Demarrez Docker: docker-compose up -d
    pause
)

echo.
echo [OK] Prerequis verifies
echo.
echo Demarrage des serveurs...
echo - Frontend: http://localhost:5173
echo - Backend:  http://127.0.0.1:3001
echo.
echo Appuyez sur Ctrl+C pour arreter
echo.

npm run dev

pause
