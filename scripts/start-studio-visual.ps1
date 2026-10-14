# Launch only the integrated worktree against the already migrated disposable database.
param([switch]$Background)
$ErrorActionPreference = 'Stop'
$studioRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not (Test-Path -LiteralPath (Join-Path $studioRoot 'public/js/resume-studio-documents.client.js'))) { throw 'Integrated worktree required' }
if ((Test-Path -LiteralPath (Join-Path $studioRoot '.env')) -or (Test-Path -LiteralPath (Join-Path $studioRoot '.env.local'))) { throw 'Visual launcher refuses private environment files' }
$studioRuntime = Join-Path ([IO.Path]::GetTempPath()) ('career-studio-visual-' + [Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $studioRuntime | Out-Null
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgres://postgres@127.0.0.1:55447/product_audit_resume_studio'
$env:DATABASE_SSL = 'false'
$env:HOST = '127.0.0.1'
$env:APP_URL = 'http://127.0.0.1:4317'
$env:ENV_FILE = Join-Path $studioRuntime 'no-private-env'
$env:STUDIO_VISUAL_RUNTIME = $studioRuntime
$env:STUDIO_PDF_PYTHONPATH = Join-Path ([IO.Path]::GetTempPath()) 'product-pdf-inspection'
$env:ENCRYPTION_MASTER_KEY = ('1' * 64)
$env:ENCRYPTION_KEY_VERSION = 'v1'
$env:SESSION_COOKIE_SECRET = 'test-only-studio-cookie-secret-minimum-thirty-two-characters'
$env:SESSION_COOKIE_NAME = 'career_hub_session'
foreach ($studioVariable in @('GEMINI_API_KEY','GOOGLE_CLOUD_PROJECT','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','GITHUB_APP_ID','GITHUB_APP_PRIVATE_KEY','ACTION_APPROVAL_HMAC_SECRET','CAREER_HUB_APPROVAL_SECRET')) {
    Remove-Item -LiteralPath ('Env:' + $studioVariable) -ErrorAction SilentlyContinue
}
$studioArguments = @('--import','./tests/setup/approval-signing-env.js','./scripts/serve-studio-visual.mjs')
if ($Background) {
    $studioProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $studioArguments -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $studioRuntime 'server.log') -RedirectStandardError (Join-Path $studioRuntime 'server-errors.log') -PassThru
    Write-Output ('Visual server process: ' + $studioProcess.Id)
    Write-Output ('Runtime manifest directory: ' + $studioRuntime)
} else {
    Push-Location $studioRoot
    try { & node.exe @studioArguments } finally { Pop-Location }
}
