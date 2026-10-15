# Start the browser acceptance harness and run full Playwright browser verification
param(
    [switch]$ServerOnly,
    [switch]$Headed,
    [string]$Viewport = ""
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgres://postgres@127.0.0.1:55447/product_audit_resume_studio'
$env:DATABASE_SSL = 'false'
$env:HOST = '127.0.0.1'
$env:APP_URL = 'http://127.0.0.1:4330'
$env:ENCRYPTION_MASTER_KEY = ('1' * 64)
$env:ENCRYPTION_KEY_VERSION = 'v1'
$env:SESSION_COOKIE_SECRET = 'browser-acceptance-cookie-secret-min-thirty-two-chars'
$env:SESSION_COOKIE_NAME = 'career_hub_session'
$env:STUDIO_PDF_PYTHONPATH = Join-Path ([IO.Path]::GetTempPath()) 'product-pdf-inspection'

foreach ($var in @('GEMINI_API_KEY','GOOGLE_CLOUD_PROJECT','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','GITHUB_APP_ID','GITHUB_APP_PRIVATE_KEY','ACTION_APPROVAL_HMAC_SECRET','CAREER_HUB_APPROVAL_SECRET')) {
    Remove-Item -LiteralPath ('Env:' + $var) -ErrorAction SilentlyContinue
}

Push-Location $repoRoot
try {
    if ($ServerOnly) {
        & node.exe --import ./tests/setup/studio-isolated-env.js --import ./tests/setup/approval-signing-env.js ./scripts/serve-browser-acceptance.mjs
    } else {
        $testArgs = @('--import', './tests/setup/studio-isolated-env.js', '--import', './tests/setup/approval-signing-env.js', './scripts/verify-browser-acceptance.mjs')
        if ($Headed) { $testArgs += '--headed' }
        if ($Viewport) { $testArgs += @('--viewport', $Viewport) }
        & node.exe @testArgs
    }
} finally {
    Pop-Location
}
