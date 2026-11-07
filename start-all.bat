@echo off
setlocal EnableDelayedExpansion

goto main

:CheckPort
set "TARGET_PORT=%~1"
netstat -ano -p tcp | findstr /C:":%TARGET_PORT% " >nul
if errorlevel 1 (
    echo Port %TARGET_PORT% is free.
    exit /b 0
) else (
    echo Port %TARGET_PORT% is already in use.
    exit /b 1
)

:main
echo ========================================================
echo               Starting LifePilot AI Stack
echo ========================================================

:: 1. PostgreSQL (port 5433)
call :CheckPort 5433
if %ERRORLEVEL% EQU 0 (
    echo [1/4] Starting PostgreSQL 18 on port 5433...
    start "LifePilot - PostgreSQL" "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D "D:\Projects\.pgdata" -p 5433
    ping 127.0.0.1 -n 4 >nul
) else (
    echo [1/4] PostgreSQL already running on port 5433. Skipping start.
)

:: 2. Redis (port 6379)
call :CheckPort 6379
if %ERRORLEVEL% EQU 0 (
    echo [2/4] Starting Redis on port 6379...
    start "LifePilot - Redis" cmd /k "redis-server.exe"
    ping 127.0.0.1 -n 3 >nul
) else (
    echo [2/4] Redis already running on port 6379. Skipping start.
)

:: 3. Backend (port 3001)
call :CheckPort 3001
if %ERRORLEVEL% EQU 0 (
    echo [3/4] Starting Backend on port 3001...
    start "LifePilot - Backend" cmd /k "cd /d D:\Projects && npm run dev --workspace=backend"
    ping 127.0.0.1 -n 3 >nul
) else (
    echo [3/4] Backend already running on port 3001. Skipping start.
)

:: 4. Frontend (port 5173)
call :CheckPort 5173
if %ERRORLEVEL% EQU 0 (
    echo [4/4] Starting Web Frontend on port 5173...
    start "LifePilot - Frontend" cmd /k "cd /d D:\Projects && npm run dev --workspace=web -- --host --strictPort"
) else (
    echo [4/4] Frontend already running on port 5173. Skipping start.
)

echo ========================================================
echo  All LifePilot AI services launched!
echo  Web Frontend: http://localhost:5173
echo  Backend API:  http://localhost:3001
echo ========================================================
pause
