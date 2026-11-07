# LifePilot AI — PowerShell Startup Script
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "             Starting LifePilot AI Stack" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Database
Write-Host "1. Starting PostgreSQL 18 on port 5433..." -ForegroundColor Green
Start-Process -FilePath "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -ArgumentList "-D D:\Projects\.pgdata" -WindowStyle Minimized
Start-Sleep -Seconds 3

# 2. Backend
Write-Host "2. Starting Backend Server on port 3001..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location D:\Projects; node backend/dist/index.js"

# 3. Web Frontend
Write-Host "3. Starting Web Frontend on port 5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location D:\Projects; npm run dev --workspace=web -- --host"

# 4. Mobile Expo
Write-Host "4. Starting Mobile Expo on port 8081..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location D:\Projects; npm --prefix mobile run start"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " All LifePilot AI services launched!" -ForegroundColor Cyan
Write-Host " Web:     http://localhost:5173" -ForegroundColor Yellow
Write-Host " Backend: http://localhost:3001" -ForegroundColor Yellow
Write-Host " Mobile:  http://localhost:8081" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

