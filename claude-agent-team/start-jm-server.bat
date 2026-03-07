@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title JM Agent Team - Port 3000

echo.
echo  ============================================
echo   JM Agent Team  Server Start
echo  ============================================
echo.

:: -- CD --
cd /d "%~dp0"

:: -- Record start time --
for /f "tokens=1-4 delims=:." %%a in ("%TIME: =0%") do set /a "START_S=(%%a*3600)+(%%b*60)+%%c"

:: -- Node.js Check --
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [Error] Node.js not found.
    echo         Please install from https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% detected

:: -- Dependencies Check --
if not exist "node_modules\" (
    echo  [Install] node_modules not found. Running npm install...
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo  [Error] npm install failed
        pause
        exit /b 1
    )
    echo  [Done] Packages installed
)

:: -- Create .env.local if missing --
if not exist ".env.local" (
    echo  [Warning] .env.local not found. Creating default...
    (
        echo CLAUDE_CODE_MODE=sdk
        echo PORT=3000
        echo PROJECT_BASE_DIR=%CD:\=/%
        echo ENABLE_REMOTE_ACCESS=false
    ) > .env.local
    echo         Add ANTHROPIC_API_KEY to .env.local if needed.
)

:: -- Read Port from .env.local --
set SERVER_PORT=3000
for /f "tokens=2 delims==" %%p in ('findstr /i "^PORT=" .env.local 2^>nul') do set SERVER_PORT=%%p
echo  [Port] Using port %SERVER_PORT%

:: -- Stop PM2 jm-agent-team first (prevents immediate restart after port kill) --
set PM2_JS=%APPDATA%\npm\node_modules\pm2\bin\pm2
if exist "%PM2_JS%" (
    echo  [PM2] Stopping PM2 instance...
    node "%PM2_JS%" stop jm-agent-team >nul 2>&1
    timeout /t 1 /nobreak >nul
)

:: -- Kill existing LISTEN process on port --
echo  [Clean] Stopping process on port %SERVER_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids=(Get-NetTCPConnection -LocalPort %SERVER_PORT% -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique; foreach($p in $pids){$n=(Get-Process -Id $p -ErrorAction SilentlyContinue).Name; Write-Host '  -> PID' $p $n; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue}; if(-not $pids){Write-Host '  -> No process found'}"
timeout /t 1 /nobreak >nul

:: -- Clear .next directory (prevents stale vendor-chunks / worker.js errors) --
if exist ".next\" (
    echo  [Cache] Clearing .next directory...
    rmdir /S /Q ".next" >nul 2>&1
    echo  [Done] Build cache cleared
)

:: -- Start Server --
echo.
echo  -------------------------------------
echo   URL  : http://localhost:%SERVER_PORT%
echo   Exit : Ctrl+C in this window
echo  -------------------------------------
echo.

:: -- Display startup elapsed time --
for /f "tokens=1-4 delims=:." %%a in ("%TIME: =0%") do set /a "END_S=(%%a*3600)+(%%b*60)+%%c"
set /a "ELAPSED=END_S-START_S"
echo  [Time] Pre-flight completed in %ELAPSED%s
echo.

:: NODE_ENV=development: disables auth even if DASHBOARD_SECRET is set in .env.local
set NODE_ENV=development
node start-server.js

:: -- Handle abnormal exit --
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [Error] Server exited abnormally. Code: %ERRORLEVEL%
    echo.
    pause
)
