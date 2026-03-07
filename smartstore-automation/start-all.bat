@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start-all.ps1"
echo.
echo   Press any key to close this window.
echo   (Services continue running in background)
pause >nul
