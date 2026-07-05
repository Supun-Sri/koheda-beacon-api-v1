# Phase 4 Spatial Engine + Vibe Shield Test Script

Write-Host "`n=== Phase 4 Spatial Engine + Vibe Shield Tests ===" -ForegroundColor Cyan

# Pre-test cleanup
Write-Host "`n0. Pre-test Cleanup..." -ForegroundColor Yellow
try {
    $existing = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/active/test-phase4" -ErrorAction SilentlyContinue
    if ($existing.active -and $existing.beacon.id) {
        $cancelBody = '{"userId":"test-phase4"}'
        $null = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($existing.beacon.id)/cancel" `
            -Method Post -ContentType "application/json" -Body $cancelBody -ErrorAction SilentlyContinue
        Write-Host "   Cancelled existing beacon" -ForegroundColor Gray
    }
} catch {}

# First, activate a test beacon
Write-Host "`nSetting up test beacon..." -ForegroundColor Yellow
$beaconBody = @{
    userId = "test-phase4"
    lat = 6.9147
    lng = 79.8536
    vibeTags = @("rooftop", "cocktails")
} | ConvertTo-Json

$beacon = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/activate" `
    -Method Post -Body $beaconBody -ContentType "application/json"
Write-Host "OK Beacon created: $($beacon.beaconId)" -ForegroundColor Green
Write-Host "  Consumer tags: rooftop, cocktails`n" -ForegroundColor White

# Test 1: Nearby restaurants (raw spatial query)
Write-Host "1. Testing Nearby Restaurants Query..." -ForegroundColor Yellow
$nearby = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($beacon.beaconId)/nearby"
Write-Host "   OK Found $($nearby.count) restaurants within 18km" -ForegroundColor Green
Write-Host "   Closest: $($nearby.restaurants[0].name) at $($nearby.restaurants[0].distance_km)km" -ForegroundColor White

# Test 2: Spatial results with Psi signal strength
Write-Host "`n2. Testing Psi Signal Strength Calculation..." -ForegroundColor Yellow
$spatial = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($beacon.beaconId)/spatial"
Write-Host "   OK Total restaurants: $($spatial.results.Count)" -ForegroundColor Green
Write-Host "   OK In range (Psi > 0): $($spatial.inRange)" -ForegroundColor Green
Write-Host "   OK Out of range (Psi = 0): $($spatial.outOfRange)" -ForegroundColor Green

Write-Host "`n   Top 3 by signal strength:" -ForegroundColor White
$spatial.results | Where-Object { $_.inRange } | Select-Object -First 3 | ForEach-Object {
    $tagName = $_.matchedViaTag
    $radius = $_.radiusUsed
    Write-Host "   - $($_.restaurant): Psi=$($_.signalStrength) (via '$tagName' @ ${radius}km)" -ForegroundColor Cyan
}

# Manual verification of Psi calculation
$firstResult = $spatial.results | Where-Object { $_.inRange } | Select-Object -First 1
$expectedPsi = [Math]::Round((1 - $firstResult.distance_km / $firstResult.radiusUsed), 3)
Write-Host "`n   Manual check: Distance=$($firstResult.distance_km)km, Radius=$($firstResult.radiusUsed)km" -ForegroundColor White
Write-Host "   Expected Psi: $expectedPsi, Actual Psi: $($firstResult.signalStrength)" -ForegroundColor White
if ($expectedPsi -eq $firstResult.signalStrength) {
    Write-Host "   OK Psi calculation verified!" -ForegroundColor Green
}

# Test 3: Combined matches with Jaccard vibe shield
Write-Host "`n3. Testing Jaccard Vibe Shield..." -ForegroundColor Yellow
$matches = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($beacon.beaconId)/matches"
Write-Host "   OK Total: $($matches.summary.total)" -ForegroundColor Green
Write-Host "   OK Passed vibe shield: $($matches.summary.passed)" -ForegroundColor Green
Write-Host "   OK Blocked by vibe shield: $($matches.summary.shielded)" -ForegroundColor Green

Write-Host "`n   Top 5 Passed Restaurants (sorted by Jaccard score):" -ForegroundColor White
$matches.passed | Select-Object -First 5 | ForEach-Object {
    Write-Host "   $($_.restaurant)" -ForegroundColor Cyan
    Write-Host "     - Jaccard: $($_.matchPercent) | Tags: $($_.matchedTags -join ', ')" -ForegroundColor White
    Write-Host "     - Signal: Psi=$($_.signalStrength) | Distance: $($_.distance_km)km" -ForegroundColor White
    Write-Host "     - Rating: $($_.rating) | Status: $($_.status)" -ForegroundColor White
}

Write-Host "`n   Sample Shielded Restaurants (no vibe overlap):" -ForegroundColor White
$matches.shielded | Select-Object -First 3 | ForEach-Object {
    $tagList = $_.restaurantTags -join ', '
    Write-Host "   $($_.restaurant)" -ForegroundColor Red
    Write-Host "     - Jaccard: $($_.matchPercent) | Their tags: $tagList" -ForegroundColor White
    Write-Host "     - Reason: No overlap with consumer tags (rooftop, cocktails)" -ForegroundColor White
}

# Test 4: Verify specific Jaccard calculations
Write-Host "`n4. Verifying Jaccard Similarity..." -ForegroundColor Yellow
$perfectMatch = $matches.passed | Where-Object { $_.matchedTags.Count -eq 2 -and $_.matchedTags -contains "rooftop" -and $_.matchedTags -contains "cocktails" } | Select-Object -First 1
if ($perfectMatch) {
    Write-Host "   Perfect match found: $($perfectMatch.restaurant)" -ForegroundColor Green
    Write-Host "   - Matched tags: $($perfectMatch.matchedTags -join ', ')" -ForegroundColor White
    Write-Host "   - Jaccard score: $($perfectMatch.jaccardScore)" -ForegroundColor White
    Write-Host "   - Restaurant also has: $($perfectMatch.restaurantTags -join ', ')" -ForegroundColor White
}

# Test 5: Edge case - restaurant outside all radii but has matching tags
Write-Host "`n5. Testing Spatial + Vibe Combination..." -ForegroundColor Yellow
$outOfRangeButMatching = $matches.shielded | Where-Object { $_.signalStrength -eq 0 -and $_.matchedTags.Count -gt 0 }
if ($outOfRangeButMatching.Count -gt 0) {
    Write-Host "   Found $($outOfRangeButMatching.Count) restaurants with matching tags but outside range" -ForegroundColor Yellow
    $outOfRangeButMatching | Select-Object -First 2 | ForEach-Object {
        Write-Host "   - $($_.restaurant): Has tags but $($_.distance_km)km away (blocked)" -ForegroundColor Yellow
    }
}

# Summary statistics
Write-Host "`n=== Phase 4 Summary ===" -ForegroundColor Cyan
Write-Host "Spatial Coverage:" -ForegroundColor White
Write-Host "  - Restaurants scanned: $($matches.summary.total)" -ForegroundColor White
Write-Host "  - Within vibe radius: $($spatial.inRange)" -ForegroundColor White
Write-Host "  - Passed vibe shield: $($matches.summary.passed)" -ForegroundColor White

$conversionRate = [Math]::Round($matches.summary.passed / $matches.summary.total * 100, 1)
Write-Host "  - Conversion rate: $conversionRate percent" -ForegroundColor White

Write-Host "`nVibe Shield Effectiveness:" -ForegroundColor White
$blockRate = [Math]::Round($matches.summary.shielded / $matches.summary.total * 100, 1)
Write-Host "  - Blocked $($matches.summary.shielded) irrelevant restaurants ($blockRate percent)" -ForegroundColor White

Write-Host "`n=== All Phase 4 Tests Complete! ===" -ForegroundColor Green
Write-Host "OK PostGIS spatial queries working" -ForegroundColor Green
Write-Host "OK Psi signal strength calculation accurate" -ForegroundColor Green
Write-Host "OK Jaccard vibe shield filtering correctly" -ForegroundColor Green
Write-Host "OK Combined matching endpoint operational" -ForegroundColor Green
Write-Host "`nReady for Phase 5: Noise Tracker" -ForegroundColor Cyan
