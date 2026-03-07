@echo off
chcp 65001 >nul 2>&1
title JM Agent Team - PM2 Production

echo.
echo  =============================================
echo   JM Agent Team  --  PM2 Production Start
echo  =============================================
echo.

cd /d "%~dp0"

:: -- Ensure logs directory exists --
if not exist "logs\" mkdir logs
:: -- Remove legacy debug file if present --
if exist "debug_pm2.txt" del /f "debug_pm2.txt" >nul 2>&1

rem Debug log
echo [0] Script started > logs\pm2-startup.log
echo    %DATE% %TIME% >> logs\pm2-startup.log

rem Use node.exe directly (not pm2.cmd wrapper)
set PM2_JS=%APPDATA%\npm\node_modules\pm2\bin\pm2

rem ====================================================================
rem [1] Node.js
rem ====================================================================
where node >nul 2>&1
if errorlevel 1 goto err_node
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%
echo [1] Node %NODE_VER% >> logs\pm2-startup.log

rem ====================================================================
rem [2] PM2 (auto install if missing)
rem ====================================================================
where pm2 >nul 2>&1
if errorlevel 1 (
    echo  [Install] Installing PM2 globally...
    call npm install -g pm2
    if errorlevel 1 goto err_pm2_install
    echo  [Done] PM2 installed
)
for /f "tokens=*" %%v in ('node "%PM2_JS%" -v 2^>nul') do set PM2_VER=%%v
echo  [OK] PM2 v%PM2_VER%
echo [2] PM2 v%PM2_VER% >> logs\pm2-startup.log

rem ====================================================================
rem [3] cloudflared (optional)
rem ====================================================================
where cloudflared >nul 2>&1
if errorlevel 1 (
    echo  [Warn] cloudflared not found -- Tunnel disabled
    echo         Install: winget install cloudflare.cloudflared
) else (
    echo  [OK] cloudflared found
)

rem ====================================================================
rem [4] node_modules
rem ====================================================================
if not exist "node_modules\" (
    echo  [Install] Running npm install...
    npm install
    if errorlevel 1 goto err_npm
    echo  [Done] Packages installed
)

rem ====================================================================
rem [5] DASHBOARD_SECRET check
rem ====================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "$v=(gc '.env.local' -EA 0 | Where-Object{$_ -match '^DASHBOARD_SECRET=.+'} | ForEach-Object{($_ -split '=',2)[1]}) -as [string]; if($v -and $v.Length -gt 7 -and $v -match '^[A-Za-z0-9_@#!-]{8,}$'){exit 0}else{exit 1}"
if errorlevel 1 goto err_secret
echo  [OK] DASHBOARD_SECRET verified
echo [5] SECRET OK >> logs\pm2-startup.log

echo.

rem ====================================================================
rem [6] next build (auto-build if missing)
rem ====================================================================
if not exist ".next\BUILD_ID" (
    echo  [Build] No production build found -- running next build...
    echo         This may take 1-3 minutes.
    echo.
    node node_modules/next/dist/bin/next build
    if errorlevel 1 goto err_build
    echo  [Build] Production build complete
    echo.
)
echo [6] Build OK >> logs\pm2-startup.log

rem ====================================================================
rem [7] Kill any process on port 3000
rem ====================================================================
echo  [Port] Clearing port 3000...
echo [7] Port clearing >> logs\pm2-startup.log
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids=(Get-NetTCPConnection -LocalPort 3000 -State Listen -EA 0).OwningProcess|Sort-Object -Unique; foreach($p in $pids){Stop-Process -Id $p -Force -EA 0; Write-Output ('  Killed PID '+$p)}"
echo [7] Port cleared EL=%ERRORLEVEL% >> logs\pm2-startup.log
timeout /t 2 /nobreak >nul

if exist "current-url.txt" (
    del /f "current-url.txt" >nul 2>&1
    echo  [Clean] Old tunnel URL file removed
)

rem Pre-start PM2 daemon via hidden process (pm2 ping)
rem   Daemon startup is the only time stdin is stolen on Windows
rem   Once daemon is up, all PM2 commands use IPC only -- stdin is safe
echo  [PM2] Starting PM2 daemon (hidden)...
echo [pm2-ping] Starting >> logs\pm2-startup.log
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process node -ArgumentList '%PM2_JS%','ping' -WorkingDirectory '%CD%' -WindowStyle Hidden -Wait"
echo [pm2-ping] Done EL=%ERRORLEVEL% >> logs\pm2-startup.log

rem Daemon is running -- IPC only from here, stdin is safe
echo  [PM2] Cleaning up old instances...
echo [pm2-stop] >> logs\pm2-startup.log
node "%PM2_JS%" stop jm-agent-team >nul 2>&1
echo [pm2-delete] >> logs\pm2-startup.log
node "%PM2_JS%" delete jm-agent-team >nul 2>&1

echo  [PM2] Starting production server...
echo [pm2-start] Starting >> logs\pm2-startup.log
node "%PM2_JS%" start ecosystem.config.js
echo [pm2-start] Done EL=%ERRORLEVEL% >> logs\pm2-startup.log
if errorlevel 1 goto err_pm2_start

:pm2_ok
echo.
echo  =============================================
echo  Local:    http://localhost:3000/login
echo  External: See Tunnel URL below (up to 40s)
echo.
echo  NOTE: Login required (enter DASHBOARD_SECRET)
echo  =============================================
echo.
echo [pm2-ok] >> logs\pm2-startup.log

rem ====================================================================
rem [8.5] Health check -- verify server is responding
rem ====================================================================
echo  [Health] Waiting for server to respond (max 30s)...
set HEALTH_WAIT=0

:health_loop
if %HEALTH_WAIT% geq 30 goto health_timeout
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }"
if %ERRORLEVEL% equ 0 goto health_ok
timeout /t 2 /nobreak >nul
set /a HEALTH_WAIT+=2
goto health_loop

:health_ok
echo  [Health] Server is responding! (OK)
echo [health] OK >> logs\pm2-startup.log
goto after_health

:health_timeout
echo  [Health] Warning: Server not responding after 30s
echo          Check: node "%PM2_JS%" logs jm-agent-team
echo [health] TIMEOUT >> logs\pm2-startup.log

:after_health

rem ====================================================================
rem [8] Wait for Tunnel URL (max 40s)
rem ====================================================================
set WAIT=0

:url_wait
if %WAIT% geq 40 goto url_timeout
if exist "current-url.txt" goto url_found
if %WAIT% equ 0  echo  [Wait] Connecting Cloudflare Tunnel (up to 40s)...
if %WAIT% equ 10 echo  [Wait] Still connecting... (%WAIT%s elapsed)
if %WAIT% equ 20 echo  [Wait] Still connecting... (%WAIT%s elapsed)
if %WAIT% equ 30 echo  [Wait] Still connecting... (%WAIT%s elapsed)
timeout /t 1 /nobreak >nul
set /a WAIT+=1
goto url_wait

:url_found
echo.
echo  +====================================================+
echo   External URL (Cloudflare Tunnel):
for /f "tokens=2 delims==" %%U in ('findstr "PUBLIC_URL=" current-url.txt') do (
    echo    %%U
)
echo.
echo   Local    : http://localhost:3000/login
echo   Password : DASHBOARD_SECRET from .env.local
echo  +====================================================+
echo.
echo [url-found] >> logs\pm2-startup.log
goto show_done

:url_timeout
echo.
echo  =============================================
echo  Local:    http://localhost:3000/login
echo  External: URL not assigned (check cloudflared)
echo  =============================================
echo.
echo [url-timeout] >> logs\pm2-startup.log

:show_done
echo  Server is running in background (PM2).
echo  You can close this window -- server keeps running.
echo.
echo  --- Live logs (Ctrl+C stops log display, server keeps running) ---
echo.
echo [show-done] >> logs\pm2-startup.log
cmd /k node "%PM2_JS%" logs jm-agent-team --no-color

rem ====================================================================
rem Error handlers
rem ====================================================================
:err_build
echo.
echo  [Error] next build failed. Check TypeScript errors above.
echo.
echo [Error] err_build >> logs\pm2-startup.log
echo  Window closes in 99s automatically.
timeout /t 99 /nobreak >nul
exit /b 1

:err_node
echo.
echo  [Error] Node.js not found
echo          Install via: nvm install 22  or  https://nodejs.org
echo.
echo [Error] err_node >> logs\pm2-startup.log
echo  Window closes in 99s automatically.
timeout /t 99 /nobreak >nul
exit /b 1

:err_pm2_install
echo.
echo  [Error] PM2 install failed. Try manually: npm install -g pm2
echo.
echo [Error] err_pm2_install >> logs\pm2-startup.log
echo  Window closes in 99s automatically.
timeout /t 99 /nobreak >nul
exit /b 1

:err_npm
echo.
echo  [Error] npm install failed
echo.
echo [Error] err_npm >> logs\pm2-startup.log
echo  Window closes in 99s automatically.
timeout /t 99 /nobreak >nul
exit /b 1

:err_secret
echo.
echo  [Error] DASHBOARD_SECRET is not set or is still a placeholder.
echo          Edit .env.local and set a real secret, then re-run.
echo.
echo  Generate a secret in PowerShell:
echo  -join ((65..90)+(97..122)+(48..57) ^| Get-Random -Count 32 ^| ForEach-Object {[char]$_})
echo.
echo [Error] err_secret >> logs\pm2-startup.log
echo  Window closes in 99s automatically.
timeout /t 99 /nobreak >nul
exit /b 1

:err_pm2_start
echo.
echo  [Error] PM2 start failed.
echo.
echo [Error] err_pm2_start >> logs\pm2-startup.log
echo  Window closes in 99s automatically.
timeout /t 99 /nobreak >nul
exit /b 1
