@echo off
chcp 65001 >nul 2>&1
title JM Agent Team - Launcher
cd /d "%~dp0"

echo.
echo  =============================================
echo   JM Agent Team  --  Launcher
echo  =============================================
echo.
echo   [1] Dev   mode  (terminal, no login)     [default]
echo   [2] Prod  mode  (PM2 + Cloudflare Tunnel)
echo   [3] Silent mode (background, no window)
echo.
echo   Press 1, 2, or 3 ...  (auto Dev in 5s)
echo.

choice /C 123 /T 5 /D 1
set MODE=%ERRORLEVEL%
echo.

if "%MODE%"=="2" goto prod
if "%MODE%"=="3" goto silent

:dev
echo  ============================================
echo   Starting DEVELOPMENT server...
echo  ============================================
echo.
call start-jm-server.bat
goto :eof

:prod
echo  ============================================
echo   Starting PRODUCTION server (PM2)...
echo  ============================================
echo.
call start-pm2-prod.bat
goto :eof

:silent
echo  ============================================
echo   Starting BACKGROUND server (no window)...
echo  ============================================
echo.
node start-background.js
if %ERRORLEVEL% equ 0 (
    echo.
    echo  Server is running in the background!
    echo  URL:  http://localhost:3000
    echo  Logs: view-logs.bat
    echo  Stop: stop-server.bat
    echo.
) else (
    echo.
    echo  [Error] Failed to start background server
    echo.
)
pause
goto :eof
