@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion

echo ════════════════════════════════════════════════════
echo   재배 리포트 생성기 - 빌드 스크립트
echo ════════════════════════════════════════════════════
echo.

REM ── 환경 확인 ────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [오류] Node.js 가 설치되어 있지 않습니다.
    echo        https://nodejs.org 에서 설치 후 다시 실행하세요.
    pause & exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
    echo [오류] Python 이 설치되어 있지 않습니다.
    pause & exit /b 1
)

python -m pyinstaller --version >nul 2>&1
if errorlevel 1 (
    echo [안내] PyInstaller 가 없습니다. 자동 설치합니다...
    pip install pyinstaller
    if errorlevel 1 ( echo [오류] PyInstaller 설치 실패 & pause & exit /b 1 )
)

REM ── 경로 설정 ─────────────────────────────────────────────────
set SCRIPT_DIR=%~dp0
set FRONTEND_DIR=%SCRIPT_DIR%frontend
set BACKEND_DIR=%SCRIPT_DIR%backend
set STATIC_DST=%BACKEND_DIR%\static
set OUT_DIR=%FRONTEND_DIR%\out

echo [1/4] 프론트엔드 의존성 설치 중...
cd /d "%FRONTEND_DIR%"
call npm install
if errorlevel 1 ( echo [오류] npm install 실패 & pause & exit /b 1 )

echo.
echo [2/4] Next.js 정적 빌드 중 (output: export)...
call npm run build
if errorlevel 1 ( echo [오류] Next.js 빌드 실패 & pause & exit /b 1 )

if not exist "%OUT_DIR%" (
    echo [오류] out/ 폴더가 생성되지 않았습니다. next.config.mjs 를 확인하세요.
    pause & exit /b 1
)

echo.
echo [3/4] 정적 파일 복사: frontend\out → backend\static
if exist "%STATIC_DST%" (
    echo   기존 static/ 삭제 중...
    rmdir /s /q "%STATIC_DST%"
)
xcopy "%OUT_DIR%" "%STATIC_DST%" /e /i /q
if errorlevel 1 ( echo [오류] 파일 복사 실패 & pause & exit /b 1 )
echo   복사 완료: %STATIC_DST%

echo.
echo [4/4] PyInstaller 빌드 중...
cd /d "%SCRIPT_DIR%"

REM 백엔드 패키지 자동 설치
pip install -r "%BACKEND_DIR%\requirements.txt" -q
if errorlevel 1 ( echo [경고] 일부 패키지 설치 실패 - 계속 진행합니다. )

pyinstaller sunamri.spec --noconfirm
if errorlevel 1 ( echo [오류] PyInstaller 빌드 실패 & pause & exit /b 1 )

REM ── 바탕화면으로 복사 ──────────────────────────────────────────
set EXE_NAME=재배_리포트생성기.exe
set EXE_SRC=%SCRIPT_DIR%dist\%EXE_NAME%
set DESKTOP=%USERPROFILE%\Desktop

echo.
echo [완료] 바탕화면에 복사 중...
if exist "%EXE_SRC%" (
    copy /Y "%EXE_SRC%" "%DESKTOP%\%EXE_NAME%" >nul
    if errorlevel 1 (
        echo [경고] 바탕화면 복사 실패 - dist\ 폴더에서 직접 가져가세요.
    ) else (
        echo   복사 완료: %DESKTOP%\%EXE_NAME%
    )
) else (
    echo [경고] exe 파일을 찾을 수 없습니다: %EXE_SRC%
)

echo.
echo ════════════════════════════════════════════════════
echo   빌드 완료!
echo   실행 파일: 바탕화면\재배_리포트생성기.exe
echo ════════════════════════════════════════════════════
echo.
echo   ※ 바탕화면의 exe 파일을 더블클릭하면 브라우저가 자동으로 열립니다.
echo   ※ 처음 실행 시 Windows Defender 경고가 뜰 수 있습니다.
echo      (추가 정보 → 실행 클릭)
echo.

pause
