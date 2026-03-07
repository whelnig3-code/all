# 환경 설정 자동 생성 스크립트
# setup-env.bat에서 호출됨

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root ".env"
$dashEnv = Join-Path $root "apps\dashboard\.env.local"

$pass = $null
$token = $null

# 1. 루트 .env 생성
if (Test-Path $envFile) {
    Write-Host "  [SKIP] .env already exists"
} else {
    $pass = [Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
    $token = -join ((1..32) | ForEach-Object { "{0:x2}" -f (Get-Random -Maximum 256) })
    $ekey = -join ((1..32) | ForEach-Object { "{0:x2}" -f (Get-Random -Maximum 256) })

    $lines = @(
        "DATABASE_URL=postgresql://user:password@localhost:5432/smartstore"
        "MASTER_ENCRYPTION_KEY=$ekey"
        "NAVER_CLIENT_ID="
        "NAVER_CLIENT_SECRET="
        "NAVER_SHOP_ID="
        "NAVER_COMMERCE_API_BASE_URL=https://api.commerce.naver.com"
        "TRANSLATOR_ADAPTER=google-free"
        "DEEPL_API_KEY="
        "NOTIFICATION_ADAPTER=telegram"
        "TELEGRAM_BOT_TOKEN="
        "TELEGRAM_CHAT_ID="
        "LLM_ADAPTER=ollama"
        "OLLAMA_BASE_URL=http://localhost:11434"
        "OPENAI_API_KEY="
        "REDIS_HOST=localhost"
        "REDIS_PORT=6379"
        "REDIS_PASSWORD="
        "SOURCING_ALIEXPRESS_ENABLED=false"
        "SOURCING_TAOBAO_ENABLED=false"
        "ADMIN_USER=admin"
        "ADMIN_PASS=$pass"
        "ADMIN_PROXY_TOKEN=$token"
        "AUTO_PRICE_ENABLED=true"
        "AUTO_ORDER_ENABLED=true"
        "AUTO_SHIPPING_ENABLED=true"
        "ACCOUNT_ID=default"
        "OCR_ENGINE=paddleocr"
        "IMAGE_OUTPUT_DIR=./data/generated"
        "NAVER_IMAGE_UPLOAD_ENABLED=true"
        "BLOG_POSTING_ENABLED=false"
        "NAVER_BLOG_ACCESS_TOKEN="
        "NODE_ENV=development"
        "LOG_LEVEL=debug"
        "PORT=3100"
    )

    [IO.File]::WriteAllLines($envFile, $lines, [Text.Encoding]::UTF8)
    Write-Host "  [OK] .env created"
}

# 2. 대시보드 .env.local 생성
if (Test-Path $dashEnv) {
    Write-Host "  [SKIP] .env.local already exists"
} else {
    # .env에서 값 읽기 (이미 존재하는 경우)
    if (-not $pass) {
        foreach ($line in (Get-Content $envFile)) {
            if ($line -match "^ADMIN_PASS=(.+)$") { $pass = $Matches[1] }
            if ($line -match "^ADMIN_PROXY_TOKEN=(.+)$") { $token = $Matches[1] }
        }
    }

    $dashDir = Split-Path $dashEnv
    if (-not (Test-Path $dashDir)) {
        New-Item -ItemType Directory -Path $dashDir -Force | Out-Null
    }

    $dashLines = @(
        "ADMIN_USER=admin"
        "ADMIN_PASS=$pass"
        "INTERNAL_API_BASE=http://localhost:3100"
        "ADMIN_PROXY_TOKEN=$token"
        "NEXT_PUBLIC_ADMIN_PROXY_TOKEN=$token"
    )

    [IO.File]::WriteAllLines($dashEnv, $dashLines, [Text.Encoding]::UTF8)
    Write-Host "  [OK] .env.local created"
}
