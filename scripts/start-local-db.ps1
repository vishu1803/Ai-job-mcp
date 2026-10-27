# Start local PostgreSQL 17 development cluster on port 5433
$ErrorActionPreference = 'Stop'

$pgData = 'C:\Users\VISHW\.career-hub-pgdata'
$pgLog = Join-Path $pgData 'server.log'
$postgresExe = 'C:\Program Files\PostgreSQL\17\bin\postgres.exe'

$running = Get-Process -Name postgres -ErrorAction SilentlyContinue | Where-Object {
    $conn = Get-NetTCPConnection -OwningProcess $_.Id -LocalPort 5433 -ErrorAction SilentlyContinue
    $null -ne $conn
}

if ($running) {
    Write-Host "Local PostgreSQL development cluster is already running on port 5433."
    exit 0
}

Write-Host "Starting local PostgreSQL development cluster on port 5433..."
Start-Process -FilePath $postgresExe -ArgumentList "-D `"$pgData`" -p 5433" -WindowStyle Hidden
Start-Sleep -Seconds 2

$conn = Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "Local PostgreSQL development cluster started successfully on port 5433."
} else {
    Write-Warning "Waiting for PostgreSQL to start..."
    Start-Sleep -Seconds 3
}
