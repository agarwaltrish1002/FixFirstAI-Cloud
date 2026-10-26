@echo off
setlocal
title FixFirst AI - Dedicated Launcher

echo =====================================================================
echo         FIXFIRST AI -- SMART CAMPUS RISK PLATFORM
echo =====================================================================
echo [ISO] Ensuring FixFirst AI operates independently...

set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

:: Check ports 8001 and 5174 specifically for FixFirstAI
netstat -ano | findstr ":8001 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [INFO] Port 8001 is already in use.
)

netstat -ano | findstr ":5174 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [INFO] Port 5174 is already in use.
)

:: 1. Verify Ollama & Model
echo.
echo [1/3] Checking Ollama & qwen2.5-coder:7b...
ollama list 2>nul | findstr /i "qwen2.5-coder:7b" >nul
if %errorlevel% equ 0 (
    echo [OK] Local Ollama is active with qwen2.5-coder:7b model.
) else (
    echo [NOTICE] Ollama not detected or busy.
    echo FixFirst AI will still function with deterministic safety rules.
)

:: 2. Launch FastAPI Backend on Port 8001
echo.
echo [2/3] Launching FastAPI Backend on http://127.0.0.1:8001 ...
start "FixFirst AI - FastAPI Backend" cmd /k "cd /d ""%PROJECT_ROOT%"" && .\venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8001"

:: Wait 3 seconds for backend initialization
timeout /t 3 >nul

:: 3. Launch Vite Frontend on Port 5174
echo.
echo [3/3] Launching Vite Frontend on http://localhost:5174 ...
start "FixFirst AI - Vite Frontend" cmd /k "cd /d ""%PROJECT_ROOT%\frontend"" && npx.cmd vite --port 5174 --host"

:: Wait 2 seconds and open browser
timeout /t 2 >nul
echo.
echo [LAUNCH] Opening FixFirst AI Dashboard in browser...
start http://localhost:5174/

echo =====================================================================
echo FixFirst AI is running!
echo   Frontend: http://localhost:5174/
echo   Backend:  http://127.0.0.1:8001/
echo   API Docs: http://127.0.0.1:8001/docs
echo.
echo Keep the two minimized FixFirst AI command windows open while using.
echo To cleanly stop FixFirst AI only, run: stop_fixfirst.bat
echo =====================================================================
