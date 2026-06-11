@echo off
chcp 65001 >nul
echo ==========================================
echo English Learning App Launcher
echo ==========================================
echo.

:: Check Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    echo [DOWNLOAD] https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python first.
    echo [DOWNLOAD] https://www.python.org/
    pause
    exit /b 1
)
echo [OK] Python found

:: Check dependencies
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies. Check network connection.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [INFO] Dependencies already exist, skipping...
)

:: Start backend server
echo [INFO] Starting backend API server...
start "Backend API Server" cmd /k "node server.js"

:: Wait for backend to start
echo [INFO] Waiting for backend service...
timeout /t 3 /nobreak >nul

:: Start frontend server
echo [INFO] Starting frontend static server...
start "Frontend Static Server" cmd /k "python -m http.server 8000"

:: Wait for frontend to start
echo [INFO] Waiting for frontend service...
timeout /t 3 /nobreak >nul

:: Verify services are running
echo [INFO] Verifying services...
curl -s -o nul -w "" http://localhost:3456/api/health 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Backend may not be fully started yet
) else (
    echo [OK] Backend API server is running
)

curl -s -o nul -w "" http://localhost:8000 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Frontend may not be fully started yet
) else (
    echo [OK] Frontend static server is running
)

:: Open browser
echo [INFO] Opening browser...
start http://localhost:8000

echo ==========================================
echo [SUCCESS] All services started!
echo ==========================================
echo [ACCESS] App URL: http://localhost:8000
echo [ACCESS] API URL: http://localhost:3456
echo [ACCESS] Health Check: http://localhost:3456/api/health
echo.
echo Press any key to exit this window...
pause >nul