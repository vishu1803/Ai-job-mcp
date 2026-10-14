# Manual local acceptance helper, not the production export path.
# Complete Word activation/first-run setup interactively before invoking.
# Invoke with an external timeout; never terminate an unverified Word process.
param([Parameter(Mandatory=$true)][string]$ArtifactDirectory)
$ErrorActionPreference = 'Stop'
$studioRoot = [IO.Path]::GetFullPath($ArtifactDirectory)
$studioTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $studioRoot.StartsWith($studioTempRoot, [StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($studioRoot)).StartsWith('career-studio-inspect-')) {
    throw 'Renderer accepts only its isolated artifact directory'
}
$studioInput = Join-Path $studioRoot 'resume.docx'
$studioOutput = Join-Path $studioRoot 'resume-word.pdf'
if (-not (Test-Path -LiteralPath $studioInput)) { throw 'DOCX input missing' }
if (-not ('StudioWordProcess' -as [type])) {
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class StudioWordProcess { [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'
}
$studioBeforeWord = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$studioWord = $null
$studioDocument = $null
$studioOwnsWord = $false
try {
    $studioWord = New-Object -ComObject Word.Application
    $studioNewWord = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Where-Object { $studioBeforeWord -notcontains $_.Id })
    if ($studioNewWord.Count -ne 1 -or $studioWord.Documents.Count -ne 0 -or $studioWord.Visible) {
        throw 'Cannot obtain an isolated Word renderer instance'
    }
    $studioOwnsWord = $true
    $studioWord.Visible = $false
    $studioWord.DisplayAlerts = 0
    $studioWord.AutomationSecurity = 3
    $studioDocument = $studioWord.Documents.Open($studioInput, $false, $true, $false)
    [uint32]$studioWordProcessId = 0
    [void][StudioWordProcess]::GetWindowThreadProcessId([IntPtr]$studioDocument.Windows.Item(1).Hwnd, [ref]$studioWordProcessId)
    if ($studioWordProcessId -ne $studioNewWord[0].Id) {
        $studioOwnsWord = $false
        throw 'Office window does not belong to the isolated renderer process'
    }
    $studioDocument.ExportAsFixedFormat($studioOutput, 17)
    if (-not (Test-Path -LiteralPath $studioOutput)) { throw 'Office produced no PDF' }
} finally {
    if ($studioDocument) { $studioDocument.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($studioDocument) }
    # Never close a pre-existing instance or documents opened by somebody else.
    if ($studioWord) {
        if ($studioOwnsWord -and $studioWord.Documents.Count -eq 0) { $studioWord.Quit() }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($studioWord)
    }
}
