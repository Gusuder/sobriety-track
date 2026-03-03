param(
  [string]$ComposeFile = "",
  [string]$OutputDir = "",
  [string]$DbName = "sobriety_track",
  [string]$DbUser = "postgres"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ComposeFile) {
  $ComposeFile = Join-Path $repoRoot "docker-compose.yml"
}
if (-not $OutputDir) {
  $OutputDir = Join-Path $repoRoot "backups"
}

if (-not (Test-Path $ComposeFile)) {
  throw "Compose file not found: $ComposeFile"
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$backupPath = Join-Path $OutputDir "db-$DbName-$stamp.sql"

Write-Host "Creating backup: $backupPath" -ForegroundColor Cyan
docker compose -f $ComposeFile exec -T postgres sh -lc "pg_dump -U $DbUser -d $DbName --no-owner --no-privileges" > $backupPath
if ($LASTEXITCODE -ne 0) {
  throw "Backup failed"
}

Write-Host "Backup created: $backupPath" -ForegroundColor Green
