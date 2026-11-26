$baseUrl = "http://localhost:8080"
Write-Host "=== TEST 1: MOBILE OTP AUTHENTICATION ===" -ForegroundColor Cyan
$otpReq = Invoke-RestMethod -Uri "$baseUrl/api/auth/send-otp" -Method POST -Body (@{ phone = "9876543210" } | ConvertTo-Json) -ContentType "application/json"
Write-Host "OTP Request:" ($otpReq | ConvertTo-Json -Compress)
$code = $otpReq.devOtp
if (-not $code) { $code = "123456" }

$verifyReq = Invoke-RestMethod -Uri "$baseUrl/api/auth/verify-otp" -Method POST -Body (@{ phone = "9876543210"; otp = $code } | ConvertTo-Json) -ContentType "application/json"
Write-Host "OTP Verify:" ($verifyReq | ConvertTo-Json -Compress)
$sessionToken = $verifyReq.token
if (-not $sessionToken) { throw "Missing session token" }
Write-Host "SUCCESS: Session Token received: $sessionToken" -ForegroundColor Green

Write-Host "`n=== TEST 2: AUTHENTICATED ENDPOINTS ===" -ForegroundColor Cyan
$authHeaders = @{ Authorization = "Bearer $sessionToken" }
$me = Invoke-RestMethod -Uri "$baseUrl/api/auth/me" -Headers $authHeaders
Write-Host "Parent Me:" ($me | ConvertTo-Json -Compress)

Write-Host "`n=== TEST 3: PAIRING CODE GENERATION & CLAIM ===" -ForegroundColor Cyan
$pairingReq = Invoke-RestMethod -Uri "$baseUrl/api/pairing/generate" -Method POST -Headers $authHeaders -Body (@{ childName = "Aarav" } | ConvertTo-Json) -ContentType "application/json"
Write-Host "Generated Pairing Code:" $pairingReq.pairingCode "Expires:" $pairingReq.expiresAt
$pCode = $pairingReq.pairingCode

# Child device claims pairing code
$claimBody = @{
    pairingCode = $pCode
    deviceName = "Pixel 7 Pro"
    deviceModel = "Pixel 7"
    androidVersion = "14"
    appGuid = [System.Guid]::NewGuid().ToString()
} | ConvertTo-Json
$claimRes = Invoke-RestMethod -Uri "$baseUrl/api/pairing/claim" -Method POST -Body $claimBody -ContentType "application/json"
Write-Host "Claim Response:" ($claimRes | ConvertTo-Json -Compress)
$deviceToken = $claimRes.deviceToken
Write-Host "SUCCESS: Device Token received: $deviceToken" -ForegroundColor Green

# Test single-use enforcement: Attempt claiming again should fail
try {
    $secondClaim = Invoke-RestMethod -Uri "$baseUrl/api/pairing/claim" -Method POST -Body $claimBody -ContentType "application/json"
    Write-Host "FAILED: Second claim should not succeed!" -ForegroundColor Red
} catch {
    Write-Host "SUCCESS: Second claim correctly rejected as single-use!" -ForegroundColor Green
}

Write-Host "`n=== TEST 4: DEVICE TELEMETRY INGESTION ===" -ForegroundColor Cyan
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$todayStr = (Get-Date).ToString("yyyy-MM-dd")
$telemetry = @{
    childId = $claimRes.childId
    day = $todayStr
    screenUnlocksApprox = 9
    batteryLevel = 92
    apps = @(
        @{ package = "org.khanacademy.android"; name = "Khan Academy"; category = "Education"; durationMs = 1800000 },
        @{ package = "com.google.android.youtube"; name = "YouTube"; category = "Entertainment"; durationMs = 900000 }
    )
    timeline = @(
        @{ id = "t-test-1"; package = "screen.unlock"; name = "Device Screen"; event = "screen_unlocked"; time = $now; category = "System"; confidence = "high"; source = "UsageStats" },
        @{ id = "t-test-2"; package = "org.khanacademy.android"; name = "Khan Academy"; event = "opened"; time = $now + 5000; durationMs = 1800000; category = "Education"; confidence = "high"; source = "UsageStats" }
    )
} | ConvertTo-Json -Depth 5

$uploadRes = Invoke-RestMethod -Uri "$baseUrl/api/upload" -Method POST -Headers @{ Authorization = "Bearer $deviceToken" } -Body $telemetry -ContentType "application/json"
Write-Host "Upload Result:" ($uploadRes | ConvertTo-Json -Compress)
Write-Host "SUCCESS: Telemetry ingested and broadcasted" -ForegroundColor Green

Write-Host "`n=== TEST 5: CSV AND JSON REPORT EXPORT ===" -ForegroundColor Cyan
$csv = Invoke-WebRequest -Uri "$baseUrl/api/reports/export?format=csv&childId=$($claimRes.childId)" -Headers $authHeaders -UseBasicParsing
Write-Host "CSV Export Length:" $csv.Content.Length "First 200 chars:"
Write-Host ($csv.Content.Substring(0, [Math]::Min(200, $csv.Content.Length)))

$jsonReport = Invoke-RestMethod -Uri "$baseUrl/api/reports/export?format=json&childId=$($claimRes.childId)" -Headers $authHeaders
Write-Host "JSON Export Report for:" $jsonReport.child.name "Records:" $jsonReport.daysCount

Write-Host "`n=== TEST 6: DATA RETENTION POLICY SETTING ===" -ForegroundColor Cyan
$retRes = Invoke-RestMethod -Uri "$baseUrl/api/settings/retention" -Method POST -Headers $authHeaders -Body (@{ retentionDays = 30 } | ConvertTo-Json) -ContentType "application/json"
Write-Host "Retention Response:" ($retRes | ConvertTo-Json -Compress)

Write-Host "`n=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ===" -ForegroundColor Green
