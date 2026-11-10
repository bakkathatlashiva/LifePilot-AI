@echo off
setlocal enabledelayedexpansion
echo ===================================================
echo   LifePilot AI - Cleaning Stuck Ports (3001, 5173, 8081)
echo ===================================================

for %%P in (3001 5173 8081) do (
    set "PORT=%%P"
    for /f "tokens=5" %%A in ('netstat -ano -p tcp ^| findstr /R /C:":%%P[ ]" ^| findstr /C:"LISTENING"') do (
        echo [INFO] Found process PID %%A using port !PORT! - Terminating...
        taskkill /F /PID %%A >nul 2>&1
    )
)

echo [OK] Ports 3001 (Backend), 5173 (Web), 8081 (Mobile) are clean and free.
echo ===================================================
