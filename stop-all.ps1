# =============================================
# 스마트스토어 자동화 시스템 — 통합 종료 스크립트
#
# 비유: 항공기 착륙 절차. 서비스(엔진)를 하나씩 안전하게 끄고,
#       Docker(격납고)는 데이터를 보존한 채 중지한다.
#
# 사용법:
#   더블클릭: stop-all.bat (이 스크립트를 자동 호출)
#   PowerShell: .\stop-all.ps1
# =============================================

$ErrorActionPreference = "Continue"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

$API_PORT = 3100
$DASHBOARD_PORT = 4000

function Write-Step([string]$msg) {
    Write-Host "  $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Stop-PortProcess([int]$port, [string]$label) {
    $found = $false
    $connections = netstat -aon 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
    foreach ($line in $connections) {
        $parts = $line.ToString().Trim() -split '\s+'
        $pid = [int]$parts[-1]
        if ($pid -gt 0) {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            $found = $true
        }
    }
    if ($found) {
        Write-Ok "$label 종료 완료 (포트 $port)"
    } else {
        Write-Ok "$label 이미 중지됨"
    }
}

# =============================================
# 메인
# =============================================

Write-Host ""
Write-Host "  ===================================" -ForegroundColor White
Write-Host "    스마트스토어 자동화 시스템 종료" -ForegroundColor White
Write-Host "  ===================================" -ForegroundColor White
Write-Host ""

# 1. API 서버 종료
Write-Step "API 서버 종료 중..."
Stop-PortProcess $API_PORT "API 서버"

# 2. 대시보드 종료
Write-Step "대시보드 종료 중..."
Stop-PortProcess $DASHBOARD_PORT "대시보드"

# 3. 워커 종료 (smartstore 관련 node 프로세스)
Write-Step "워커 종료 중..."
$workerProcs = Get-Process node -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like '*smartstore*' }
if ($workerProcs) {
    $workerProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Ok "워커 종료 완료"
} else {
    Write-Ok "워커 이미 중지됨"
}

# 4. Docker 컨테이너 중지 (데이터 보존)
$dockerAvailable = $false
try {
    $null = Get-Command docker -ErrorAction Stop
    $dockerAvailable = $true
} catch {}

if ($dockerAvailable) {
    Write-Step "Docker 컨테이너 중지 중..."
    docker compose -f (Join-Path $PSScriptRoot "docker-compose.yml") stop 2>$null | Out-Null
    Write-Ok "Docker 컨테이너 중지 완료 (데이터 보존)"
}

Write-Host ""
Write-Host "  모든 서비스가 종료되었습니다." -ForegroundColor Green
Write-Host "  (DB 데이터는 Docker volume에 보존됩니다)" -ForegroundColor Gray
Write-Host ""

Start-Sleep -Seconds 3
