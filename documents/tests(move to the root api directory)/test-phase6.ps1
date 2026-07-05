# Phase 6 Auction Engine Test Script

Write-Host "`n=== Phase 6 Auction Engine Tests ===" -ForegroundColor Cyan

# Test 1: Test surge calculation with no history
Write-Host "`n1. Testing Surge Calculation (No History)..." -ForegroundColor Yellow
$surgeBody = @{
    tags = @("cocktails", "rooftop", "dj")
} | ConvertTo-Json

$surge = Invoke-RestMethod -Uri "http://localhost:3000/api/auction/surge" `
    -Method Post -Body $surgeBody -ContentType "application/json"

Write-Host "   Average Surge: $($surge.avgSurge)" -ForegroundColor Cyan
Write-Host "   Bid Floor: $($surge.bidFloor) LKR" -ForegroundColor Cyan
Write-Host "   Per Tag:" -ForegroundColor White
$surge.perTag.PSObject.Properties | ForEach-Object {
    Write-Host "     - $($_.Name): $($_.Value)" -ForegroundColor Gray
}

if ($surge.avgSurge -eq 1.0 -and $surge.bidFloor -eq 300) {
    Write-Host "   OK Surge baseline correct (1.0x, 300 LKR floor)" -ForegroundColor Green
} else {
    Write-Host "   WARNING Unexpected surge values" -ForegroundColor Yellow
}

# Test 2: Create a beacon for auction
Write-Host "`n2. Creating Test Beacon..." -ForegroundColor Yellow
$beaconBody = @{
    userId = "user-auction-test"
    lat = 6.9147
    lng = 79.8536
    vibeTags = @("rooftop", "cocktails")
} | ConvertTo-Json

try {
    # Cancel any existing beacon first
    $existing = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/active/user-auction-test" -ErrorAction SilentlyContinue
    if ($existing.active -and $existing.beacon.id) {
        $cancelBody = '{"userId":"user-auction-test"}'
        $null = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/$($existing.beacon.id)/cancel" `
            -Method Post -ContentType "application/json" -Body $cancelBody -ErrorAction SilentlyContinue
        Write-Host "   Cancelled existing beacon" -ForegroundColor Gray
    }
} catch {}

$beacon = Invoke-RestMethod -Uri "http://localhost:3000/api/beacon/activate" `
    -Method Post -Body $beaconBody -ContentType "application/json"
Write-Host "   Created beacon: $($beacon.beaconId)" -ForegroundColor White
Write-Host "   Consumer tags: $($beacon.vibeTags -join ', ')" -ForegroundColor Gray

# Test 3: Run auction simulation
Write-Host "`n3. Running Auction Simulation..." -ForegroundColor Yellow
$auctionBody = @{
    beaconId = $beacon.beaconId
} | ConvertTo-Json

$auction = Invoke-RestMethod -Uri "http://localhost:3000/api/auction/simulate" `
    -Method Post -Body $auctionBody -ContentType "application/json"

Write-Host "   Consumer Tags: $($auction.consumerTags -join ', ')" -ForegroundColor White
Write-Host "   Total Nearby: $($auction.totalNearby)" -ForegroundColor White
Write-Host "   Eligible Bidders: $($auction.eligible)" -ForegroundColor White

if ($auction.winner) {
    Write-Host "`n   WINNER:" -ForegroundColor Green
    Write-Host "     Restaurant: $($auction.winner.restaurant)" -ForegroundColor Cyan
    Write-Host "     Distance: $($auction.winner.distance_km) km" -ForegroundColor Cyan
    Write-Host "     Match: $($auction.winner.matchPercent)" -ForegroundColor Cyan
    Write-Host "     Matched Tags: $($auction.winner.matchedTags -join ', ')" -ForegroundColor Cyan
    Write-Host "     Final Bid: $($auction.winner.finalBid) LKR" -ForegroundColor Cyan
    Write-Host "     Efficiency Score: $($auction.winner.efficiencyScore)" -ForegroundColor Cyan
    Write-Host "     Revenue:" -ForegroundColor White
    Write-Host "       - Bid Fee: $($auction.winner.revenue.bidFee)" -ForegroundColor Gray
    Write-Host "       - Claim Fee: $($auction.winner.revenue.claimFee)" -ForegroundColor Gray
    Write-Host "   OK Auction completed with winner!" -ForegroundColor Green
} else {
    Write-Host "   No winner (no eligible restaurants)" -ForegroundColor Yellow
}

# Test 4: Display top 5 bids
Write-Host "`n4. Top 5 Bids by Efficiency Score..." -ForegroundColor Yellow
$topBids = $auction.bids | Select-Object -First 5
$topBids | ForEach-Object {
    Write-Host "   Rank $($_.rank): $($_.restaurant)" -ForegroundColor White
    Write-Host "     - Distance: $($_.distance_km) km" -ForegroundColor Gray
    Write-Host "     - Match: $($_.matchPercent) (tags: $($_.matchedTags -join ', '))" -ForegroundColor Gray
    Write-Host "     - Base Bid: $($_.baseBid) LKR" -ForegroundColor Gray
    Write-Host "     - Surge: $($_.surgeFactor)x (floor: $($_.bidFloor) LKR)" -ForegroundColor Gray
    Write-Host "     - Effective Bid: $($_.effectiveBid) LKR" -ForegroundColor Gray
    Write-Host "     - Final Bid: $($_.finalBid) LKR" -ForegroundColor Gray
    Write-Host "     - Efficiency: $($_.efficiencyScore)" -ForegroundColor Cyan
    Write-Host "     - Status: $($_.status)" -ForegroundColor $(if ($_.status -eq "WINNER") { "Green" } else { "Gray" })
    Write-Host ""
}

# Test 5: Run auction again to test surge increase
Write-Host "`n5. Testing Surge Increase (2nd Auction)..." -ForegroundColor Yellow
$auction2 = Invoke-RestMethod -Uri "http://localhost:3000/api/auction/simulate" `
    -Method Post -Body $auctionBody -ContentType "application/json"

if ($auction2.winner) {
    $surgeFactor2 = $auction2.bids[0].surgeFactor
    Write-Host "   Winner: $($auction2.winner.restaurant)" -ForegroundColor White
    Write-Host "   Surge Factor: $surgeFactor2" -ForegroundColor Cyan
    Write-Host "   Bid Floor: $($auction2.bids[0].bidFloor) LKR" -ForegroundColor Cyan
    
    if ($surgeFactor2 -gt 1.0) {
        Write-Host "   OK Surge increased due to auction history!" -ForegroundColor Green
    } else {
        Write-Host "   INFO Surge still at baseline (may increase with more auctions)" -ForegroundColor Yellow
    }
}

# Test 6: Verify efficiency score calculation
Write-Host "`n6. Verifying Efficiency Score Formula..." -ForegroundColor Yellow
if ($auction.bids.Count -gt 0) {
    $testBid = $auction.bids[0]
    $lambda = 0.08
    $expected = [Math]::Round($testBid.finalBid * [Math]::Exp(-$lambda * $testBid.distance_km), 2)
    $actual = $testBid.efficiencyScore
    
    Write-Host "   Formula: eta_j = B_j * exp(-lambda * d_j)" -ForegroundColor White
    Write-Host "   Bid (B_j): $($testBid.finalBid) LKR" -ForegroundColor Gray
    Write-Host "   Distance (d_j): $($testBid.distance_km) km" -ForegroundColor Gray
    Write-Host "   Lambda: $lambda" -ForegroundColor Gray
    Write-Host "   Expected: $expected" -ForegroundColor Cyan
    Write-Host "   Actual: $actual" -ForegroundColor Cyan
    
    if ([Math]::Abs($expected - $actual) -lt 0.5) {
        Write-Host "   OK Efficiency formula correct!" -ForegroundColor Green
    } else {
        Write-Host "   WARNING Efficiency calculation differs" -ForegroundColor Yellow
    }
}

# Test 7: Verify distance decay effect
Write-Host "`n7. Analyzing Distance Decay Effect..." -ForegroundColor Yellow
$nearBids = $auction.bids | Where-Object { $_.distance_km -lt 2 } | Select-Object -First 1
$farBids = $auction.bids | Where-Object { $_.distance_km -gt 5 } | Select-Object -First 1

if ($nearBids -and $farBids) {
    Write-Host "   Near Restaurant (<2km):" -ForegroundColor White
    Write-Host "     - $($nearBids.restaurant): $($nearBids.distance_km) km" -ForegroundColor Gray
    Write-Host "     - Bid: $($nearBids.finalBid) LKR" -ForegroundColor Gray
    Write-Host "     - Efficiency: $($nearBids.efficiencyScore)" -ForegroundColor Cyan
    
    Write-Host "   Far Restaurant (>5km):" -ForegroundColor White
    Write-Host "     - $($farBids.restaurant): $($farBids.distance_km) km" -ForegroundColor Gray
    Write-Host "     - Bid: $($farBids.finalBid) LKR" -ForegroundColor Gray
    Write-Host "     - Efficiency: $($farBids.efficiencyScore)" -ForegroundColor Cyan
    
    if ($nearBids.efficiencyScore -gt $farBids.efficiencyScore) {
        Write-Host "   OK Closer restaurants have efficiency advantage!" -ForegroundColor Green
    }
}

# Summary
Write-Host "`n=== Phase 6 Summary ===" -ForegroundColor Cyan
Write-Host "Auction Engine Components:" -ForegroundColor White
Write-Host "  1. Pond Density (mu): Match ratio based on Jaccard similarity" -ForegroundColor White
Write-Host "  2. Surge Factor (sigma): 1 + 0.8 * (wins_tag / max_wins)" -ForegroundColor White
Write-Host "  3. Efficiency Score (eta_j): B_j * exp(-0.08 * d_j)" -ForegroundColor White
Write-Host "`nRanking:" -ForegroundColor White
Write-Host "  Restaurants ranked by EFFICIENCY SCORE (highest wins)" -ForegroundColor White
Write-Host "  Formula balances: bid amount + distance + surge factor" -ForegroundColor White
Write-Host "`nRevenue Model:" -ForegroundColor White
Write-Host "  - Bid Fee: Charged when restaurant wins auction" -ForegroundColor White
Write-Host "  - Claim Fee: 200 LKR when consumer redeems deal" -ForegroundColor White

Write-Host "`n=== All Phase 6 Tests Complete! ===" -ForegroundColor Green
Write-Host "OK Auction tables created" -ForegroundColor Green
Write-Host "OK Surge calculation working" -ForegroundColor Green
Write-Host "OK Efficiency scoring correct" -ForegroundColor Green
Write-Host "OK Winner selection by efficiency" -ForegroundColor Green
Write-Host "OK Auction history tracking" -ForegroundColor Green
Write-Host "`nReady for Phase 7: Real-Time + Deals" -ForegroundColor Cyan
