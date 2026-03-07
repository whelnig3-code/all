@echo off
chcp 65001 > nul
echo ========================================
echo  펌프 리포터 빌드 스크립트
echo ========================================

:: ── 버전 번호 읽기 ──────────────────────────────────────────
:: VERSION.txt 첫 번째 줄에서 버전 문자열을 읽어옴
set /p VERSION=<VERSION.txt
:: 앞뒤 공백 제거
set VERSION=%VERSION: =%
echo [버전] %VERSION%

:: ── Step 1: 이전 빌드 결과물 클린 삭제 ──────────────────────
:: 불필요한 캐시가 새 빌드에 영향을 주는 것을 방지
echo.
echo [1/5] 이전 빌드 폴더 정리 중...
if exist "build" (
    rmdir /s /q "build"
    echo   build\ 삭제 완료
)
if exist "dist" (
    rmdir /s /q "dist"
    echo   dist\ 삭제 완료
)

:: ── Step 2: 의존성 설치 ──────────────────────────────────────
echo.
echo [2/5] 의존성 설치 중...
pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [오류] pip install 실패. 빌드를 중단합니다.
    pause
    exit /b 1
)

:: ── Step 3: PyInstaller 빌드 ──────────────────────────────────
:: --clean: 임시 캐시 파일 강제 삭제 후 빌드
:: --noconfirm: 덮어쓰기 확인 프롬프트 생략
echo.
echo [3/5] PyInstaller 빌드 중...
pyinstaller pump_reporter.spec --clean --noconfirm
if %ERRORLEVEL% neq 0 (
    echo [오류] PyInstaller 빌드 실패. 빌드를 중단합니다.
    pause
    exit /b 1
)

:: ── Step 4: 배포용 폴더 구조 생성 ───────────────────────────
echo.
echo [4/5] 배포용 폴더 구조 생성 중...
if not exist "dist\PumpReporter\input"           mkdir "dist\PumpReporter\input"
if not exist "dist\PumpReporter\output\reports"  mkdir "dist\PumpReporter\output\reports"
if not exist "dist\PumpReporter\output\charts"   mkdir "dist\PumpReporter\output\charts"
if not exist "dist\PumpReporter\output\cache"    mkdir "dist\PumpReporter\output\cache"
if not exist "dist\PumpReporter\data"            mkdir "dist\PumpReporter\data"

:: ── Step 5: 배포용 ZIP 생성 ──────────────────────────────────
:: PowerShell Compress-Archive 사용 (Windows 기본 내장, 별도 설치 불필요)
:: 파일명 형식: PumpReporter_v{버전}.zip
echo.
echo [5/5] 배포용 ZIP 생성 중...
set ZIP_NAME=PumpReporter_v%VERSION%.zip

:: 기존 ZIP 파일이 있으면 덮어쓰기 전 삭제
if exist "%ZIP_NAME%" (
    del /f /q "%ZIP_NAME%"
    echo   기존 %ZIP_NAME% 삭제 완료
)

:: PowerShell로 dist\PumpReporter 전체를 ZIP으로 압축
powershell -NoProfile -Command ^
    "Compress-Archive -Path 'dist\PumpReporter' -DestinationPath '%ZIP_NAME%' -Force"

if %ERRORLEVEL% neq 0 (
    echo [오류] ZIP 생성 실패. dist\PumpReporter 폴더를 직접 배포하세요.
    pause
    exit /b 1
)

:: ── 빌드 완료 요약 ────────────────────────────────────────────
echo.
echo ========================================
echo  빌드 완료!
echo ----------------------------------------
echo  실행 파일: dist\PumpReporter\PumpReporter.exe
echo  배포 ZIP:  %ZIP_NAME%
echo ========================================
pause
