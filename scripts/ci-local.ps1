param(
  [switch]$SkipSmoke,
  [switch]$SkipWebE2E,
  [switch]$RequireGoogleOAuth
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Step($text) {
  Write-Host "== $text" -ForegroundColor Cyan
}

function Assert-ExitCode($commandName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$commandName failed with exit code $LASTEXITCODE"
  }
}

Step "API tests"
Push-Location (Join-Path $repoRoot "apps/api")
try {
  $testFiles = Get-ChildItem -Path "src" -Recurse -Filter "*.test.ts" | ForEach-Object { $_.FullName }
  if (-not $testFiles -or $testFiles.Count -eq 0) {
    throw "No API test files found under apps/api/src"
  }
  node --import tsx --import ./src/test/setup-env.ts --test $testFiles
  Assert-ExitCode "API tests"
} finally {
  Pop-Location
}

if (-not $SkipSmoke) {
  Step "Smoke E2E"
  $smokeArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $repoRoot "scripts/smoke-e2e.ps1")
  )
  if ($RequireGoogleOAuth) {
    $smokeArgs += "-RequireGoogleOAuth"
  }
  powershell @smokeArgs
  Assert-ExitCode "Smoke E2E"
}

if (-not $SkipWebE2E) {
  Step "Web regression E2E"
  Push-Location (Join-Path $repoRoot "e2e")
  try {
    npm test
    Assert-ExitCode "Web regression E2E"
  } finally {
    Pop-Location
  }
}

Step "Done"
Write-Host "Local CI checks passed" -ForegroundColor Green
