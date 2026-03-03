param(
  [string]$ApiBase = "http://localhost:4000",
  [string]$WebBase = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

$api = "$ApiBase/api"
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$login = "smoke_$stamp"
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

Step "Auth register/login"
$registerBody = @{ login = $login; email = $email; displayName = "Smoke User"; password = $password } | ConvertTo-Json
[void](Invoke-RestMethod -Method POST -Uri "$api/auth/register" -ContentType "application/json" -Body $registerBody)

$loginBody = @{ login = $login; password = $password } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Method POST -Uri "$api/auth/login" -ContentType "application/json" -Body $loginBody
$token = $loginRes.accessToken
if (-not $token) {
  throw "Login failed: no access token"
}
$headers = @{ Authorization = "Bearer $token" }

Step "Auth negative checks"
$badLoginBody = @{ login = $login; password = "WrongPass123!" } | ConvertTo-Json
try {
  [void](Invoke-RestMethod -Method POST -Uri "$api/auth/login" -ContentType "application/json" -Body $badLoginBody)
  throw "Expected 401 for invalid credentials"
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  if ($statusCode -ne 401) {
    throw "Expected 401 for invalid credentials, got $statusCode"
  }
}

try {
  [void](Invoke-RestMethod -Method POST -Uri "$api/onboarding" -ContentType "application/json" -Body (@{ startMode = "now"; goalDays = 30 } | ConvertTo-Json))
  throw "Expected 401 for onboarding without token"
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  if ($statusCode -ne 401) {
    throw "Expected 401 for onboarding without token, got $statusCode"
  }
}

Step "Onboarding"
$onboardingBody = @{ startMode = "now"; goalDays = 30 } | ConvertTo-Json
$onboardingSave = Invoke-RestMethod -Method POST -Uri "$api/onboarding" -Headers $headers -ContentType "application/json" -Body $onboardingBody
if (-not $onboardingSave.profile) {
  throw "Onboarding save failed"
}
[void](Invoke-RestMethod -Method GET -Uri "$api/onboarding" -Headers $headers)

Step "Goals/progress"
$goals = Invoke-RestMethod -Method GET -Uri "$api/goals" -Headers $headers
if (-not $goals.activeGoal) {
  throw "Expected active goal after onboarding"
}

$newGoalBody = @{ targetDays = 45 } | ConvertTo-Json
$newGoal = Invoke-RestMethod -Method POST -Uri "$api/goals" -Headers $headers -ContentType "application/json" -Body $newGoalBody
if ($newGoal.goal.target_days -ne 45) {
  throw "Goal create failed"
}

$goalsAfter = Invoke-RestMethod -Method GET -Uri "$api/goals" -Headers $headers
if (-not $goalsAfter.progress) {
  throw "Goal progress was not returned"
}

Step "Reasons + entries"
$reasons = Invoke-RestMethod -Method GET -Uri "$api/entries/reasons" -Headers $headers
if (@($reasons.reasons).Count -lt 1) {
  throw "Reasons list is empty"
}

$entryBody = @{
  entryDate = $today
  drank = $false
  mood = "good"
  stressLevel = 3
  cravingLevel = 4
  daySummary = "Smoke E2E entry"
  comment = "ok"
  reasonCodes = @("stress", "boredom")
} | ConvertTo-Json

[void](Invoke-RestMethod -Method POST -Uri "$api/entries" -Headers $headers -ContentType "application/json" -Body $entryBody)
$entries = Invoke-RestMethod -Method GET -Uri "$api/entries?from=$from&to=$today" -Headers $headers
if (@($entries.entries).Count -lt 1) {
  throw "Entries list is empty"
}

Step "Web smoke"
$html = (Invoke-WebRequest -UseBasicParsing -Uri $WebBase).Content
if ($html -notlike "*id=""goalDaysWizard""*") {
  throw "Web UI does not contain onboarding goal step"
}
if ($html -notlike "*loadGoals()*") {
  throw "Web UI does not contain loadGoals() call"
}

Step "Done"
Write-Host "Smoke E2E passed" -ForegroundColor Green
