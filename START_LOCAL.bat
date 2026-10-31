@echo off
title FixFirst AI - Local Cloud Launcher
echo =====================================================================
echo               FIXFIRST AI -- LOCAL SERVER LAUNCHER
echo =====================================================================
echo.

set "CLOUD_DIR=%~dp0"
set "ROOT_DIR=c:\Users\Trish Agarwal\OneDrive\Desktop\lmniit"
set "PYTHON_EXE=%ROOT_DIR%\FixFirstAI\venv\Scripts\python.exe"

:: 1. Launch FastAPI Backend on Port 8001
echo [1/2] Starting FastAPI Backend on http://127.0.0.1:8001 ...
start "FixFirst AI - Backend (Port 8001)" cmd /k "cd /d ""%CLOUD_DIR%"" && ""%PYTHON_EXE%"" -m uvicorn backend.main:app --host 127.0.0.1 --port 8001 --reload"

:: Wait 2 seconds for backend to initialize
timeout /t 2 /nobreak >nul

:: 2. Launch Frontend on Port 5174
echo [2/2] Starting Frontend on http://localhost:5174 ...
start "FixFirst AI - Frontend (Port 5174)" cmd /k "cd /d ""%CLOUD_DIR%\frontend"" && node node_modules\vite\bin\vite.js --port 5174"

:: Wait 2 seconds and open browser
timeout /t 2 /nobreak >nul
echo.
echo [LAUNCH] Opening http://localhost:5174 in your browser...
start http://localhost:5174

echo.
echo =====================================================================
echo FixFirst AI is running locally!
echo   * Frontend URL: http://localhost:5174
echo   * Backend URL:  http://127.0.0.1:8001
echo   * API Docs:     http://127.0.0.1:8001/docs
echo.
echo Keep the two black command windows open while using the app.
echo =====================================================================
