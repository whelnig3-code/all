@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title JM Agent Team - Stop Server
cd /d "%~dp0"

echo.
echo  =============================================
echo   JM Agent Team  --  Stop Server
echo  =============================================
echo.

:: -- Try PM2 first --
set PM2_JS=%APPDATA%\npm\node_modules\pm2\bin\pm2
if exist "%PM2_JS%" (
    node "%PM2_JS%" describe jm-agent-team >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo  [PM2] Stopping PM2 instance...
        node "%PM2_JS%" stop jm-agent-team >nul 2>&1
        echo  [Done] PM2 server stopped
    )
)

:: -- Try PID file (background mode) --
if exist "logs\server.pid" (
    set /p SERVER_PID=<"logs\server.pid"
    echo  [PID] Stopping background server (PID !SERVER_PID!)...
    taskkill /PID !SERVER_PID! /T /F >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo  [Done] Background server stopped
    ) else (
        echo  [Info] Process not found (may have already stopped)
    )
    del /f "logs\server.pid" >nul 2>&1
)

:: -- Fallback: kill any process on port 3000 --
set SERVER_PORT=3000
if exist ".env.local" (
    for /f "tokens=2 delims==" %%p in ('findstr /i "^PORT=" .env.local 2^>nul') do set SERVER_PORT=%%p
)

echo  [Port] Checking port %SERVER_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids=(Get-NetTCPConnection -LocalPort %SERVER_PORT% -State Listen -EA 0).OwningProcess|Sort-Object -Unique; foreach($p in $pids){$n=(Get-Process -Id $p -EA 0).Name; Write-Host '  -> Stopped PID' $p $n; Stop-Process -Id $p -Force -EA 0}; if(-not $pids){Write-Host '  -> No process on port %SERVER_PORT%'}"

echo.
echo  [Done] Server stopped successfully
echo.
pause
