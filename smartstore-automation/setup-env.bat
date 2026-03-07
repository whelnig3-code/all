@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   ===================================
echo     환경 설정 자동 생성
echo   ===================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0setup-env.ps1"

echo.
echo   ===================================
echo     설정 완료!
echo   ===================================
echo.
echo   다음 단계: start-all.bat 을 더블클릭하세요.
echo.
timeout /t 5 /nobreak >nul
