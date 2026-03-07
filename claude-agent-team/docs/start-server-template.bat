@echo off
:: ────────────────────────────────────────────────────────────────────────────
:: Next.js + Socket.IO 서버 범용 런처 템플릿
:: 사용법: 이 파일을 새 프로젝트 루트에 복사하고
::         .env.local 의 PORT 값을 프로젝트마다 다르게 설정하세요.
::
::   프로젝트별 권장 포트
::   ┌─────────────────────────────┬──────┐
::   │ JM Agent Team (이 프로젝트)  │ 3000 │
::   │ 스마트스토어                 │ 3001 │
::   │ 기타 프로젝트 A              │ 3002 │
::   └─────────────────────────────┴──────┘
:: ────────────────────────────────────────────────────────────────────────────
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title 프로젝트 서버

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║          프로젝트 서버 시작              ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: ── Node.js 확인 ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [오류] Node.js 미설치. https://nodejs.org 참고.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [확인] Node.js %NODE_VER%

:: ── 의존성 확인 ──────────────────────────────────────────────────────────────
if not exist "node_modules\" (
    echo  [설치] npm install 실행 중...
    call npm install
    if !ERRORLEVEL! neq 0 ( echo  [오류] npm install 실패 & pause & exit /b 1 )
)

:: ── .env.local 없으면 기본 생성 ─────────────────────────────────────────────
if not exist ".env.local" (
    echo  [경고] .env.local 없음. 기본 생성 중...
    ( echo PORT=3001 ) > .env.local
    echo         PORT 값을 프로젝트에 맞게 수정하세요.
)

:: ── 포트 읽기 ────────────────────────────────────────────────────────────────
set SERVER_PORT=3001
for /f "tokens=2 delims==" %%p in ('findstr /i "^PORT=" .env.local 2^>nul') do set SERVER_PORT=%%p
echo  [포트] %SERVER_PORT% 번 사용

:: ── PowerShell로 LISTEN 프로세스만 종료 ──────────────────────────────────────
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids=(Get-NetTCPConnection -LocalPort %SERVER_PORT% -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique; foreach($p in $pids){Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host '  -> PID' $p '종료'}; if(-not $pids){Write-Host '  -> [정리] 점유 없음'}"
timeout /t 1 /nobreak >nul

:: ── .next 캐시 초기화 ────────────────────────────────────────────────────────
if exist ".next\" ( rmdir /S /Q ".next" >nul 2>&1 & echo  [초기화] .next 캐시 삭제 )

:: ── 실행 ─────────────────────────────────────────────────────────────────────
echo.
echo  ┌─────────────────────────────────────────┐
echo  │  주소: http://localhost:%SERVER_PORT%              │
echo  │  종료: Ctrl+C                           │
echo  └─────────────────────────────────────────┘
echo.

node start-server.js

if %ERRORLEVEL% neq 0 ( echo. & echo  [오류] 서버 비정상 종료 (코드: %ERRORLEVEL%) & pause )
