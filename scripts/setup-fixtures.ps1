# Prepares the manual testing fixtures as defined in docs/development/manual-testing.md
# Works on Windows PowerShell.
$ErrorActionPreference = "Stop"

$TargetDir = "$env:USERPROFILE\mdview-tests"
Write-Host "Creating test fixtures directory at: $TargetDir"
New-Item -ItemType Directory -Force "$TargetDir\repo" | Out-Null
Set-Location "$TargetDir"

Write-Host "Creating small.md..."
"# Small`n`nbody" | Set-Content small.md

Write-Host "Creating empty.md..."
New-Item empty.md -ItemType File -Force | Out-Null

Write-Host "Creating big.md (~9 MB)..."
$line = "line with some text to grow the document`n"
[System.IO.File]::WriteAllText("$PWD\big.md", ($line * 200000))

Write-Host "Creating huge.md (~100 MB)..."
[System.IO.File]::WriteAllText("$PWD\huge.md", ($line * 2200000))

Write-Host "Creating utf16le.md (UTF-16 LE with BOM)..."
Set-Content -Encoding Unicode utf16le.md "line one`nline two"

Write-Host "Creating latin1.md (invalid UTF-8 bytes)..."
[System.IO.File]::WriteAllBytes("$PWD\latin1.md", [byte[]](0x63, 0x61, 0x66, 0xE9, 0x0A))

Write-Host "Setting up git repo fixture inside $TargetDir\repo..."
Set-Location "$TargetDir\repo"
if (-not (Test-Path ".git")) {
    git init -q
}
"# Version one`n" | Set-Content chapter.md
git add .
git commit -qm "init"
"# Version one`n`nnew paragraph`n" | Set-Content chapter.md
"# Draft`n" | Set-Content untracked.md

Write-Host ""
Write-Host "=== Fixtures created successfully ==="
Get-ChildItem -Path "$TargetDir"
Write-Host ""
Write-Host "Repo status:"
git status -s
