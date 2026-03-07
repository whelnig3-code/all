@echo off
chcp 65001 >nul 2>&1
title JM Agent Team - Live Logs
cd /d "%~dp0"

echo.
echo  =============================================
echo   JM Agent Team  --  Live Logs
echo  =============================================
echo.
echo   Press Ctrl+C to stop viewing (server keeps running)
echo.

:: -- Check PM2 first --
set PM2_JS=%APPDATA%\npm\node_modules\pm2\bin\pm2
if exist "%PM2_JS%" (
    node "%PM2_JS%" describe jm-agent-team >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo  [PM2] Showing PM2 logs...
        echo.
        node "%PM2_JS%" logs jm-agent-team --lines 50
        goto :eof
    )
)

:: -- Fallback: tail log file --
if exist "logs\server-stdout.log" (
    echo  [Log] Tailing logs/server-stdout.log ...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content 'logs\server-stdout.log' -Tail 50 -Wait"
) else (
    echo  [Info] No log file found.
    echo         Start the server first with start.bat or start-silent.vbs
    echo.
    pause
)
