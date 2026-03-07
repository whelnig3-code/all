$conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "PID=$($c.OwningProcess) State=$($c.State) Name=$($proc.Name)"
}
