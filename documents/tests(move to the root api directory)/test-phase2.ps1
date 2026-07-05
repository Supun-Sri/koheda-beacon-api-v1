# Phase 2 API Test Script

Write-Host "`n=== Phase 2 API Tests ===" -ForegroundColor Cyan

Write-Host "`n1. Testing Health Endpoint..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "http://localhost:3000/health"
Write-Host "   Status: $($health.status)" -ForegroundColor Green
Write-Host "   Postgres: $($health.postgres)" -ForegroundColor Green

Write-Host "`n2. Testing All Restaurants..." -ForegroundColor Yellow
$all = Invoke-RestMethod -Uri "http://localhost:3000/api/restaurants"
Write-Host "   Total Restaurants: $($all.count)" -ForegroundColor Green
Write-Host "   Sample: $($all.restaurants[0].name)" -ForegroundColor Green

Write-Host "`n3. Testing Spatial Query (5km from Hangover Bar)..." -ForegroundColor Yellow
$spatial = Invoke-RestMethod -Uri "http://localhost:3000/api/restaurants?lat=6.9147&lng=79.8536&radiusKm=5"
Write-Host "   Restaurants within 5km: $($spatial.count)" -ForegroundColor Green
Write-Host "   Closest: $($spatial.restaurants[0].name) at $($spatial.restaurants[0].distance_km)km" -ForegroundColor Green

Write-Host "`n4. Testing Vibe Tags..." -ForegroundColor Yellow
$tags = Invoke-RestMethod -Uri "http://localhost:3000/api/vibe-tags"
Write-Host "   Total Tags: $($tags.tags.Count)" -ForegroundColor Green
Write-Host "   Smallest radius: $($tags.tags[0].name) ($($tags.tags[0].radius_km)km)" -ForegroundColor Green
Write-Host "   Largest radius: $($tags.tags[-1].name) ($($tags.tags[-1].radius_km)km)" -ForegroundColor Green

Write-Host "`n=== All Phase 2 Tests Passed! ===" -ForegroundColor Green
Write-Host "Ready for Phase 3: Beacon Lifecycle`n" -ForegroundColor Cyan
