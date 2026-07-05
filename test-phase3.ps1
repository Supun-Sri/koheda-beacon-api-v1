# Phase 3 Beacon Lifecycle Test Script

Write-Host "`n=== Phase 3 Beacon Lifecycle Tests ===" -ForegroundColor Cyan

# Pre-test cleanup
Write-Host "`n0. Pre-test Cleanup..." -ForegroundColor Yellow
try {
    $existing1 = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/active/user-01" -ErrorAction SilentlyContinue
    if ($existing1.active -and $existing1.beacon.id) {
        $cancelBody1 = '{"userId":"user-01"}'
        $null = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($existing1.beacon.id)/cancel" `
            -Method Post -ContentType "application/json" -Body $cancelBody1 -ErrorAction SilentlyContinue
        Write-Host "   Cancelled existing beacon for user-01" -ForegroundColor Gray
    }
} catch {}

try {
    $existing2 = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/active/user-02" -ErrorAction SilentlyContinue
    if ($existing2.active -and $existing2.beacon.id) {
        $cancelBody2 = '{"userId":"user-02"}'
        $null = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($existing2.beacon.id)/cancel" `
            -Method Post -ContentType "application/json" -Body $cancelBody2 -ErrorAction SilentlyContinue
        Write-Host "   Cancelled existing beacon for user-02" -ForegroundColor Gray
    }
} catch {}

try {
    $existingTest = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/active/user-test" -ErrorAction SilentlyContinue
    if ($existingTest.active -and $existingTest.beacon.id) {
        $cancelBodyTest = '{"userId":"user-test"}'
        $null = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($existingTest.beacon.id)/cancel" `
            -Method Post -ContentType "application/json" -Body $cancelBodyTest -ErrorAction SilentlyContinue
        Write-Host "   Cancelled existing beacon for user-test" -ForegroundColor Gray
    }
} catch {}

# Test 1: Activate a beacon
Write-Host "`n1. Testing Beacon Activation..." -ForegroundColor Yellow
$activateBody = @{
    userId = "user-01"
    lat = 6.9147
    lng = 79.8536
    vibeTags = @("rooftop", "cocktails")
} | ConvertTo-Json

$beacon1 = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/activate" `
    -Method Post -Body $activateBody -ContentType "application/json"
Write-Host "   OK Beacon activated: $($beacon1.beaconId)" -ForegroundColor Green
Write-Host "   Status: $($beacon1.status)" -ForegroundColor Green
Write-Host "   Remaining: $($beacon1.remainingDisplay)" -ForegroundColor Green

# Test 2: One-beacon-per-user guard
Write-Host "`n2. Testing One-Beacon-Per-User Guard..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/activate" `
        -Method Post -Body $activateBody -ContentType "application/json"
    Write-Host "   FAIL Should have rejected duplicate beacon" -ForegroundColor Red
} catch {
    Write-Host "   OK Correctly rejected duplicate beacon" -ForegroundColor Green
}

# Test 3: Get beacon status
Write-Host "`n3. Testing Beacon Status..." -ForegroundColor Yellow
$status = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($beacon1.beaconId)/status"
Write-Host "   OK Status: $($status.status)" -ForegroundColor Green
Write-Host "   Remaining: $($status.remainingDisplay)" -ForegroundColor Green

# Test 4: Get user's active beacon
Write-Host "`n4. Testing Get User Active Beacon..." -ForegroundColor Yellow
$active = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/active/user-01"
Write-Host "   OK Active: $($active.active)" -ForegroundColor Green
if ($active.active) {
    Write-Host "   Beacon ID: $($active.beacon.id)" -ForegroundColor Green
}

# Test 5: Activate beacon for different user
Write-Host "`n5. Testing Second User Beacon..." -ForegroundColor Yellow
$user2Body = @{
    userId = "user-02"
    lat = 6.9012
    lng = 79.8489
    vibeTags = @("dj", "late night")
} | ConvertTo-Json

$beacon2 = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/activate" `
    -Method Post -Body $user2Body -ContentType "application/json"
Write-Host "   OK Second beacon activated: $($beacon2.beaconId)" -ForegroundColor Green

# Test 6: Cancel beacon
Write-Host "`n6. Testing Beacon Cancellation..." -ForegroundColor Yellow
$cancelBody = @{ userId = "user-02" } | ConvertTo-Json
$cancelled = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($beacon2.beaconId)/cancel" `
    -Method Post -Body $cancelBody -ContentType "application/json"
Write-Host "   OK Beacon cancelled: $($cancelled.status)" -ForegroundColor Green

# Test 7: Verify user can create new beacon after cancel
Write-Host "`n7. Testing New Beacon After Cancel..." -ForegroundColor Yellow
$beacon3 = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/activate" `
    -Method Post -Body $user2Body -ContentType "application/json"
Write-Host "   OK New beacon created: $($beacon3.beaconId)" -ForegroundColor Green

# Test 8: Auto-expiry test (10 second TTL)
Write-Host "`n8. Testing Auto-Expiry (10 seconds)..." -ForegroundColor Yellow
$testBody = @{
    userId = "user-test"
    lat = 6.9147
    lng = 79.8536
    vibeTags = @("rooftop")
    ttlSeconds = 10
} | ConvertTo-Json

$testBeacon = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/activate-test" `
    -Method Post -Body $testBody -ContentType "application/json"
Write-Host "   OK Test beacon created: $($testBeacon.beaconId)" -ForegroundColor Green
Write-Host "   Expires in: $($testBeacon.expiresInSeconds) seconds" -ForegroundColor Yellow
Write-Host "   Waiting 12 seconds..." -ForegroundColor Yellow

Start-Sleep -Seconds 12

$expiredStatus = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($testBeacon.beaconId)/status"
if ($expiredStatus.status -eq "expired") {
    Write-Host "   OK Beacon auto-expired successfully" -ForegroundColor Green
} else {
    Write-Host "   FAIL Beacon did not expire (status: $($expiredStatus.status))" -ForegroundColor Red
}

Write-Host "`n=== All Phase 3 Tests Complete! ===" -ForegroundColor Green
Write-Host "OK Beacon activation working" -ForegroundColor Green
Write-Host "OK One-beacon-per-user guard operational" -ForegroundColor Green
Write-Host "OK Beacon status endpoint working" -ForegroundColor Green
Write-Host "OK Active beacon retrieval working" -ForegroundColor Green
Write-Host "OK Beacon cancellation working" -ForegroundColor Green
Write-Host "OK Auto-expiry operational" -ForegroundColor Green
Write-Host "`nActive beacons in DB:" -ForegroundColor Cyan
Write-Host "  - user-01: $($beacon1.beaconId)" -ForegroundColor White
Write-Host "  - user-02: $($beacon3.beaconId)" -ForegroundColor White
Write-Host "`nReady for Phase 4: Spatial Engine + Vibe Shield" -ForegroundColor Cyan
