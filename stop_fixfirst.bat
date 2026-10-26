@echo off
title FixFirst AI - Dedicated Shutdown
echo =====================================================================
echo Stopping FixFirst AI Dedicated Services Only...
echo (Unrelated localhost projects will remain untouched)
echo =====================================================================

:: Find and terminate the process listening specifically on Port 8001 (FixFirst Backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    echo [SHUTDOWN] Stopping FixFirst AI Backend (PID: %%a)...
    taskkill /f /pid %%a >nul 2>&1
)

:: Find and terminate the process listening specifically on Port 5174 (FixFirst Frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174 " ^| findstr "LISTENING"') do (
    echo [SHUTDOWN] Stopping FixFirst AI Frontend (PID: %%a)...
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [DONE] FixFirst AI ports 8001 and 5174 have been freed.
echo All other projects on other ports are unaffected.
timeout /t 2 >nul
