@echo off
echo ========================================
echo  펌프 리포터 빌드 스크립트
echo ========================================

echo [1/3] 의존성 설치...
pip install -r requirements.txt

echo [2/3] PyInstaller 빌드...
pyinstaller pump_reporter.spec --clean --noconfirm

echo [3/3] 출력 폴더 구조 생성...
if not exist "dist\PumpReporter\input" mkdir "dist\PumpReporter\input"
if not exist "dist\PumpReporter\output\reports" mkdir "dist\PumpReporter\output\reports"
if not exist "dist\PumpReporter\output\charts" mkdir "dist\PumpReporter\output\charts"
if not exist "dist\PumpReporter\output\cache" mkdir "dist\PumpReporter\output\cache"
if not exist "dist\PumpReporter\data" mkdir "dist\PumpReporter\data"

echo ========================================
echo  빌드 완료! dist\PumpReporter\PumpReporter.exe
echo ========================================
pause
