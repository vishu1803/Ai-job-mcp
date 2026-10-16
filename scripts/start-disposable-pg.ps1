$pgData = 'C:\Users\VISHW\AppData\Local\Temp\career-resume-studio-pgdata'
$pidFile = Join-Path $pgData 'postmaster.pid'
if (Test-Path $pidFile) {
    Write-Host "Removing stale postmaster.pid..."
    Remove-Item -Force $pidFile
}

$pgLog = 'C:\Users\VISHW\AppData\Local\Temp\career-resume-studio-pg.log'
$pgCtl = 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'

Write-Host "Starting postgres cluster on port 55447..."
& $pgCtl -D $pgData -l $pgLog -o '-p 55447' -w start
Write-Host "Postgres start command returned with exit code: $LASTEXITCODE"
