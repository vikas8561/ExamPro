@echo off
REM Start multiple Judge0 workers for high concurrency (200+ students)

echo 🚀 Starting multiple Judge0 workers for high concurrency...

REM Number of worker processes (adjust based on your server capacity)
set WORKER_COUNT=4

REM Kill any existing workers
taskkill /F /IM python.exe /FI "WINDOWTITLE eq queue_worker*" 2>nul
timeout /t 2 /nobreak >nul

REM Start multiple worker processes
for /L %%i in (1,1,%WORKER_COUNT%) do (
    echo 🔄 Starting worker %%i/%WORKER_COUNT%...
    cd worker
    set /a PORT=2358 + %%i
    start "queue_worker_%%i" python queue_worker.py
    cd ..
    timeout /t 1 /nobreak >nul
)

echo ✅ Started %WORKER_COUNT% Judge0 workers
echo 📊 Workers listening on ports: 2359-2362
echo 🔍 Monitor with: tasklist ^| findstr python
echo 🛑 Stop all workers with: taskkill /F /IM python.exe /FI "WINDOWTITLE eq queue_worker*"
pause
