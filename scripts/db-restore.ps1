param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$ComposeFile = "",
  [string]$DbName = "sobriety_track",
  [string]$DbUser = "postgres",
  [switch]$ResetPublicSchema
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ComposeFile) {
  $ComposeFile = Join-Path $repoRoot "docker-compose.yml"
}

if (-not (Test-Path $ComposeFile)) {
  throw "Compose file not found: $ComposeFile"
}
if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

if ($ResetPublicSchema) {
  Write-Host "Resetting public schema in $DbName" -ForegroundColor Yellow
  docker compose -f $ComposeFile exec -T postgres sh -lc "psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c \"DROP SCHEMA public CASCADE; CREATE SCHEMA public;\""
  if ($LASTEXITCODE -ne 0) {
    throw "Schema reset failed"
  }
}

Write-Host "Restoring backup: $BackupFile" -ForegroundColor Cyan
Get-Content -Raw -Path $BackupFile | docker compose -f $ComposeFile exec -T postgres sh -lc "psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1"
if ($LASTEXITCODE -ne 0) {
  throw "Restore failed"
}

Write-Host "Restore completed: $BackupFile" -ForegroundColor Green
