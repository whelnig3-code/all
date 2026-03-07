$pids = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
foreach ($p in $pids) {
    Write-Host "포트 3000 PID $p 종료 중..."
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}
Write-Host "완료"
