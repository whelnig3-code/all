@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   ===================================
echo     대시보드만 시작 (UI 확인용)
echo   ===================================
echo.

:: 환경변수 파일 사전 검증
if not exist ".env" (
    echo   [!] .env 파일이 없습니다. 자동 생성합니다...
    call setup-env.bat
    echo.
)
if not exist "apps\dashboard\.env.local" (
    echo   [!] 대시보드 설정 파일이 없습니다. 자동 생성합니다...
    call setup-env.bat
    echo.
)

:: 포트 충돌 방지
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":4000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /f /pid %%p >nul 2>&1
)

echo   대시보드 시작 중...
powershell -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c cd /d \"%~dp0\" && npm run dev:dashboard' -WindowStyle Hidden"

echo.
echo   시작 완료! 브라우저를 여는 중...
echo   대시보드: http://localhost:4000
echo.
echo   * API 서버 없이 실행하면 데이터 로드 에러가 뜹니다.
echo     디자인 확인에는 문제없습니다.
echo.

timeout /t 6 /nobreak >nul
start http://localhost:4000
exit
