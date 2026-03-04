param(
  [string]$ApiBase = "http://localhost:4000",
  [string]$WebBase = "http://localhost:8080",
  [switch]$RequireGoogleOAuth
)

$ErrorActionPreference = "Stop"

$api = "$ApiBase/api"
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$login = "deploy_$stamp"
$email = "$login@example.com"
$password = "StrongPass123!"
$today = (Get-Date).ToString("yyyy-MM-dd")
$from = (Get-Date -Day 1).ToString("yyyy-MM-dd")

function Step($text) {
  Write-Host "== $text" -ForegroundColor Cyan
}

Step "Health"
$health = Invoke-RestMethod -Method GET -Uri "$ApiBase/health"
if ($health.status -ne "ok") {
  throw "Health check failed"
}

Step "Readiness"
$ready = Invoke-RestMethod -Method GET -Uri "$ApiBase/ready"
if ($ready.status -ne "ready") {
  throw "Readiness check failed"
}

Step "Google OAuth config"
$googleConfig = Invoke-RestMethod -Method GET -Uri "$api/auth/google/config"
$googleEnabled = [bool]($googleConfig.enabled)
if ($RequireGoogleOAuth -and -not $googleEnabled) {
  throw "Google OAuth is required but disabled (/api/auth/google/config returned enabled=false)"
}
if ($googleEnabled) {
  if (-not $googleConfig.clientId) {
    throw "Google OAuth is enabled but clientId is empty"
  }
  Write-Host "Google OAuth: enabled" -ForegroundColor Green
} else {
  Write-Host "Google OAuth: disabled (optional mode)" -ForegroundColor Yellow
}

Step "Auth register/login"
$registerBody = @{
  login = $login
  email = $email
  displayName = "Deploy Check User"
  password = $password
} | ConvertTo-Json
[void](Invoke-RestMethod -Method POST -Uri "$api/auth/register" -ContentType "application/json" -Body $registerBody)

$loginBody = @{ login = $login; password = $password } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Method POST -Uri "$api/auth/login" -ContentType "application/json" -Body $loginBody
$token = $loginRes.accessToken
if (-not $token) {
  throw "Login failed: no access token"
}
$headers = @{ Authorization = "Bearer $token" }

Step "Onboarding"
$onboardingBody = @{ startMode = "now"; goalDays = 30 } | ConvertTo-Json
$onboardingSave = Invoke-RestMethod -Method POST -Uri "$api/onboarding" -Headers $headers -ContentType "application/json" -Body $onboardingBody
if (-not $onboardingSave.profile) {
  throw "Onboarding save failed"
}
[void](Invoke-RestMethod -Method GET -Uri "$api/onboarding" -Headers $headers)

Step "Goals"
$goals = Invoke-RestMethod -Method GET -Uri "$api/goals" -Headers $headers
if (-not $goals.activeGoal) {
  throw "Expected active goal after onboarding"
}

Step "Entries"
$entryBody = @{
  entryDate = $today
  drank = $false
  mood = "good"
  stressLevel = 3
  cravingLevel = 4
  daySummary = "Post-deploy check entry"
  comment = "ok"
  reasonCodes = @("stress", "boredom")
} | ConvertTo-Json

[void](Invoke-RestMethod -Method POST -Uri "$api/entries" -Headers $headers -ContentType "application/json" -Body $entryBody)
$entries = Invoke-RestMethod -Method GET -Uri "$api/entries?from=$from&to=$today" -Headers $headers
if (@($entries.entries).Count -lt 1) {
  throw "Entries list is empty"
}

Step "Web shell"
$html = (Invoke-WebRequest -UseBasicParsing -Uri $WebBase).Content
if ($html -notlike "*id=""authShell""*") {
  throw "Web UI auth shell not found"
}
if ($html -notlike "*id=""onboardingShell""*") {
  throw "Web UI onboarding shell not found"
}

Step "Done"
Write-Host "Post-deploy checks passed" -ForegroundColor Green
