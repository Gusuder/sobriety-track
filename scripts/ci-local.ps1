param(
  [switch]$SkipSmoke,
  [switch]$SkipWebE2E
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Step($text) {
  Write-Host "== $text" -ForegroundColor Cyan
}

Step "API tests"
Push-Location (Join-Path $repoRoot "apps/api")
try {
  npm test
} finally {
  Pop-Location
}

if (-not $SkipSmoke) {
  Step "Smoke E2E"
  powershell -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/smoke-e2e.ps1")
}

if (-not $SkipWebE2E) {
  Step "Web regression E2E"
  Push-Location (Join-Path $repoRoot "e2e")
  try {
    npm test
  } finally {
    Pop-Location
  }
}

Step "Done"
Write-Host "Local CI checks passed" -ForegroundColor Green
