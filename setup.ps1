#!/usr/bin/env pwsh
# LifePilot AI — One-time setup script
# Run from: d:\Projects\lifepilot-ai\
# Usage: .\setup.ps1 -PgPassword "your_postgres_password"

param(
    [Parameter(Mandatory=$true)]
    [string]$PgPassword,
    [string]$PgUser = "postgres",
    [string]$PgHost = "127.0.0.1",
    [string]$PgPort = "5432",
    [string]$DbName = "lifepilot_db"
)

$pgBin = "C:\Program Files\PostgreSQL\18\bin"
$env:PGPASSWORD = $PgPassword

Write-Host "🚀 LifePilot AI Setup" -ForegroundColor Cyan
Write-Host "──────────────────────────────────────────"

# 1. Test database connection
Write-Host "1. Testing PostgreSQL connection..." -ForegroundColor Yellow
$testResult = & "$pgBin\psql.exe" -U $PgUser -h $PgHost -p $PgPort -c "SELECT version();" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cannot connect to PostgreSQL: $testResult" -ForegroundColor Red
    Write-Host "   Check that PostgreSQL is running and the password is correct." -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Connected to PostgreSQL" -ForegroundColor Green

# 2. Create database
Write-Host "2. Creating database '$DbName'..." -ForegroundColor Yellow
$createResult = & "$pgBin\psql.exe" -U $PgUser -h $PgHost -p $PgPort -c "CREATE DATABASE $DbName;" 2>&1
if ($createResult -match "already exists") {
    Write-Host "   ℹ️  Database already exists, skipping." -ForegroundColor Cyan
} elseif ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create database: $createResult" -ForegroundColor Red
    exit 1
} else {
    Write-Host "   ✅ Database created" -ForegroundColor Green
}

# 3. Update .env with actual password
Write-Host "3. Updating backend/.env with database credentials..." -ForegroundColor Yellow
$envPath = "$PSScriptRoot\backend\.env"
$envContent = Get-Content $envPath
$envContent = $envContent -replace "postgresql://postgres:YOUR_POSTGRES_PASSWORD@", "postgresql://${PgUser}:${PgPassword}@"
$envContent = $envContent -replace "@127.0.0.1:5432/lifepilot_db", "@${PgHost}:${PgPort}/${DbName}"
Set-Content $envPath $envContent
Write-Host "   ✅ .env updated" -ForegroundColor Green

# 4. Run Prisma migrations
Write-Host "4. Running database migrations..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\backend"
npx prisma migrate dev --name init --skip-seed 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Migration failed — check .env DATABASE_URL" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "   ✅ Migrations applied" -ForegroundColor Green

# 5. Generate Prisma client
Write-Host "5. Generating Prisma client..." -ForegroundColor Yellow
npx prisma generate 2>&1 | Select-Object -Last 3
Write-Host "   ✅ Prisma client generated" -ForegroundColor Green

Pop-Location

Write-Host ""
Write-Host "──────────────────────────────────────────"
Write-Host "✅ Database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Add your Google OAuth credentials to backend/.env"
Write-Host "  2. Add your OpenAI API key to backend/.env"
Write-Host "  3. Start the backend:  cd backend && npm run dev"
Write-Host "  4. Start the web app:  cd web && npm run dev"
Write-Host "  5. Open: http://localhost:5173"
