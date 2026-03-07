# =============================================
# 스마트스토어 자동화 시스템 — 통합 시작 스크립트
#
# 비유: 항공기 이륙 절차. 체크리스트(사전검증) → 엔진 시동(Docker) →
#       연료 공급(DB 마이그레이션) → 시스템 점검(서비스 시작) → 이륙(대시보드 열기)
#
# 사용법:
#   더블클릭: start-all.bat (이 스크립트를 자동 호출)
#   PowerShell: .\start-all.ps1
# =============================================

$ErrorActionPreference = "Continue"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

$API_PORT = 3100
$DASHBOARD_PORT = 4000
$LOG_DIR = Join-Path $PSScriptRoot "logs"

# =============================================
# 헬퍼 함수
# =============================================

function Write-Step([string]$msg) {
    Write-Host "  $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "  [!] $msg" -ForegroundColor Yellow
}

function Write-Fail([string]$msg) {
    Write-Host "  [X] $msg" -ForegroundColor Red
}

function Wait-ForUrl([string]$url, [int]$maxRetries = 15, [int]$delaySec = 2) {
    for ($i = 0; $i -lt $maxRetries; $i++) {
        Start-Sleep -Seconds $delaySec
        try {
            $null = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            return $true
        } catch {
            # 아직 준비 안 됨 — 계속 대기
        }
    }
    return $false
}

function Import-EnvFile([string]$path) {
    if (-not (Test-Path $path)) { return }
    foreach ($line in (Get-Content $path)) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
        $eqIndex = $trimmed.IndexOf("=")
        if ($eqIndex -lt 1) { continue }
        $key = $trimmed.Substring(0, $eqIndex)
        $val = $trimmed.Substring($eqIndex + 1)
        [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

function Stop-PortProcess([int]$port) {
    $connections = netstat -aon 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
    foreach ($line in $connections) {
        $parts = $line.ToString().Trim() -split '\s+'
        $pid = [int]$parts[-1]
        if ($pid -gt 0) {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
}

# =============================================
# 메인 로직
# =============================================

Write-Host ""
Write-Host "  ===================================" -ForegroundColor White
Write-Host "    스마트스토어 자동화 시스템 시작" -ForegroundColor White
Write-Host "  ===================================" -ForegroundColor White
Write-Host ""

# --- 로그 디렉토리 생성 ---
if (-not (Test-Path $LOG_DIR)) {
    New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
}

# --- 1. 전제조건 검증 ---
Write-Step "[사전검증] Node.js / npm 확인..."

$nodeVersion = $null
try { $nodeVersion = (node --version 2>$null) } catch {}
if (-not $nodeVersion) {
    Write-Fail "Node.js가 설치되지 않았습니다. https://nodejs.org/"
    Read-Host "  아무 키나 누르면 종료합니다"
    exit 1
}

$major = [int]($nodeVersion -replace '^v','').Split('.')[0]
if ($major -lt 18) {
    Write-Fail "Node.js 18 이상 필요 (현재: $nodeVersion)"
    Read-Host "  아무 키나 누르면 종료합니다"
    exit 1
}
Write-Ok "Node.js $nodeVersion"

try {
    $npmVersion = (npm --version 2>$null)
    Write-Ok "npm $npmVersion"
} catch {
    Write-Fail "npm이 설치되지 않았습니다"
    exit 1
}

# --- 2. Docker 시작 ---
Write-Step "[Docker] 상태 확인..."

$dockerOk = $false
try {
    $null = docker info 2>$null
    $dockerOk = $true
} catch {}

if (-not $dockerOk) {
    Write-Warn "Docker Desktop이 실행되지 않았습니다. 시작합니다..."

    $dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
    } else {
        # PATH에서 찾기
        $dockerExe = Get-Command "Docker Desktop" -ErrorAction SilentlyContinue
        if ($dockerExe) {
            Start-Process $dockerExe.Source
        } else {
            Write-Fail "Docker Desktop을 찾을 수 없습니다. 수동으로 시작해주세요."
            Read-Host "  아무 키나 누르면 종료합니다"
            exit 1
        }
    }

    Write-Step "[Docker] 시작 대기 중..."
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 3
        try {
            $null = docker info 2>$null
            $dockerOk = $true
            break
        } catch {}
    }

    if (-not $dockerOk) {
        Write-Fail "Docker 시작 시간 초과 (60초). Docker Desktop을 수동으로 실행해주세요."
        Read-Host "  아무 키나 누르면 종료합니다"
        exit 1
    }
}
Write-Ok "Docker 실행 중"

# --- 3. 컨테이너 시작 ---
Write-Step "[DB] PostgreSQL + Redis 시작 중..."
docker compose up -d postgres redis 2>$null | Out-Null

# PostgreSQL 대기
Write-Step "[DB] PostgreSQL 준비 대기 중..."
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    $ready = docker compose exec -T postgres pg_isready -U user -d smartstore 2>$null
    if ($LASTEXITCODE -eq 0) { break }
}
if ($LASTEXITCODE -eq 0) {
    Write-Ok "PostgreSQL 준비 완료"
} else {
    Write-Warn "PostgreSQL 응답 없음. 계속 진행합니다..."
}

# Redis 대기
$redisPing = docker compose exec -T redis redis-cli ping 2>$null
if ($redisPing -match "PONG") {
    Write-Ok "Redis 준비 완료"
} else {
    Write-Warn "Redis 응답 없음. 계속 진행합니다..."
}

# --- 4. 환경변수 검증 ---
Write-Host ""
$envFile = Join-Path $PSScriptRoot ".env"
$dashEnv = Join-Path $PSScriptRoot "apps\dashboard\.env.local"

if (-not (Test-Path $envFile) -or -not (Test-Path $dashEnv)) {
    Write-Step "[ENV] 환경변수 파일 자동 생성 중..."
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "setup-env.ps1")
}

# .env를 현재 프로세스 환경변수에 로드 (Node.js에 dotenv가 없으므로)
if (Test-Path $envFile) {
    Import-EnvFile $envFile
    Write-Ok ".env 환경변수 로드 완료"

    # 포트 확인
    $envContent = Get-Content $envFile -Raw
    $portLine = ($envContent -split "`n") | Where-Object { $_ -match "^PORT=" }
    if ($portLine -and $portLine -notmatch "PORT=$API_PORT") {
        Write-Warn ".env의 PORT 값이 $API_PORT이 아닙니다: $portLine"
        Write-Warn "setup-env.ps1을 다시 실행하거나 .env를 수동 수정하세요."
    }
}

# --- 5. DB 마이그레이션 ---
Write-Step "[DB] Prisma 클라이언트 생성 중..."
try {
    $generateOutput = npm run db:generate 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Prisma 클라이언트 생성 완료"
    } else {
        Write-Warn "Prisma generate 경고 발생. 계속 진행합니다."
    }
} catch {
    Write-Warn "Prisma generate 실패. 계속 진행합니다."
}

Write-Step "[DB] 스키마 동기화 중 (db:push)..."
try {
    $pushOutput = npm run db:push 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "DB 스키마 동기화 완료"
    } else {
        Write-Warn "db:push 경고 발생. 계속 진행합니다."
    }
} catch {
    Write-Warn "db:push 실패. 계속 진행합니다."
}

# --- 6. 포트 충돌 방지 ---
Write-Host ""
Write-Step "기존 프로세스 정리 중..."
Stop-PortProcess $API_PORT
Stop-PortProcess $DASHBOARD_PORT
Start-Sleep -Seconds 1

# --- 7. 서비스 시작 ---
Write-Step "[1/3] API 서버 시작 (포트 $API_PORT)..."
$apiLog = Join-Path $LOG_DIR "api-server.log"
$apiErrLog = Join-Path $LOG_DIR "api-server.error.log"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev:api" `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $apiLog `
    -RedirectStandardError $apiErrLog `
    -WindowStyle Hidden

Write-Step "[..] API 서버 준비 대기 중..."
$apiReady = Wait-ForUrl "http://localhost:$API_PORT/monitoring/health" 15 2
if ($apiReady) {
    Write-Ok "API 서버 준비 완료"
} else {
    Write-Warn "API 서버 응답 없음. 로그 확인: $apiErrLog"
}

Write-Step "[2/3] 워커 시작..."
$workerLog = Join-Path $LOG_DIR "worker.log"
$workerErrLog = Join-Path $LOG_DIR "worker.error.log"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev:worker" `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $workerLog `
    -RedirectStandardError $workerErrLog `
    -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Step "[3/3] 대시보드 시작 (포트 $DASHBOARD_PORT)..."
$dashLog = Join-Path $LOG_DIR "dashboard.log"
$dashErrLog = Join-Path $LOG_DIR "dashboard.error.log"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev:dashboard" `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $dashLog `
    -RedirectStandardError $dashErrLog `
    -WindowStyle Hidden

Write-Step "[..] 대시보드 준비 대기 중..."
$dashReady = Wait-ForUrl "http://localhost:$DASHBOARD_PORT" 15 2
if ($dashReady) {
    Write-Ok "대시보드 준비 완료"
} else {
    Write-Warn "대시보드 응답 없음. 로그 확인: $dashErrLog"
}

# --- 8. 완료 ---
Write-Host ""
Write-Host "  ===================================" -ForegroundColor Green
Write-Host "    시작 완료!" -ForegroundColor Green
Write-Host "  ===================================" -ForegroundColor Green
Write-Host ""
Write-Host "  대시보드: http://localhost:$DASHBOARD_PORT" -ForegroundColor Cyan
Write-Host "  API 서버: http://localhost:$API_PORT" -ForegroundColor Cyan
Write-Host "  로그 폴더: $LOG_DIR" -ForegroundColor Cyan
Write-Host ""
Write-Host "  종료하려면: stop-all.bat 더블클릭" -ForegroundColor Gray
Write-Host ""

# 대시보드 자동 열기
Start-Process "http://localhost:$DASHBOARD_PORT"
