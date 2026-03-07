@echo off
chcp 65001 >nul
echo ============================================
echo  안평리 숙주 재배 리포트 생성기 v6.0 빌드
echo ============================================
echo.

REM 가상환경 활성화 (있는 경우)
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
    echo [OK] 가상환경 활성화 완료
) else (
    echo [INFO] 가상환경 없이 시스템 Python 사용
)

echo.
echo [1/5] 의존성 설치 중...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] 의존성 설치 실패
    pause
    exit /b 1
)

echo.
echo [2/5] 기존 빌드 정리 중...
if exist "dist" rmdir /s /q dist
if exist "build" rmdir /s /q build
if exist "*.spec" del /q *.spec

echo.
echo [3/5] exe 빌드 중...
REM --noupx: UPX 압축 비활성화 → 바이러스 오탐 감소
REM --noconsole: 콘솔 창 숨김
REM --onefile: 단일 exe 생성
pyinstaller --onefile --noconsole --noupx --clean ^
    --name "안평리_리포트_생성기_v6_0" ^
    --add-data "config;config" ^
    --add-data "assets;assets" ^
    app/main.py

if errorlevel 1 (
    echo.
    echo [ERROR] 빌드 실패!
    pause
    exit /b 1
)

echo.
echo [4/5] 바탕화면으로 복사 중...
set "DESKTOP=%USERPROFILE%\Desktop"
set "EXE_NAME=안평리_리포트_생성기_v6_0.exe"

copy /Y "dist\%EXE_NAME%" "%DESKTOP%\%EXE_NAME%" >nul 2>&1
if errorlevel 1 (
    echo [WARNING] 바탕화면 복사 실패. dist 폴더에서 직접 복사하세요.
    echo   dist\%EXE_NAME%
) else (
    echo [OK] 바탕화면에 복사 완료: %DESKTOP%\%EXE_NAME%
)

echo.
echo [5/5] 완료!
echo.
echo ============================================
echo  빌드 완료.
echo  바탕화면에 실행파일이 생성되었습니다.
echo  %DESKTOP%\%EXE_NAME%
echo ============================================
echo.
echo [중요] 바이러스 오탐 방지:
echo  - Windows Defender 제외: 설정 ^> Windows 보안 ^> 제외 추가
echo  - PowerShell(관리자): Add-MpPreference -ExclusionPath "%DESKTOP%"
echo.
echo ============================================
echo  [테스트 체크리스트]
echo ============================================
echo.
echo  [ ] 정상 파일 테스트
echo  [ ] 잘못된 파일 테스트
echo  [ ] 폴더 자동 생성 확인 (재배리포트/안평리/YYYY/MM/)
echo  [ ] 원본 데이터 복사 확인
echo  [ ] 리포트/summary_*.json + .csv 생성 확인
echo  [ ] 표지 시트 로고 + 회사 정보 확인
echo  [ ] 대시보드 제목 잘림 없는지 확인
echo  [ ] 각 시트 L1 보안 표기 확인
echo  [ ] Header/Footer 인쇄 미리보기 확인
echo  [ ] 파일 속성(메타데이터) 확인
echo  [ ] 로그 파일 생성 확인
echo.
pause
