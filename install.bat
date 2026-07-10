@echo off
cd /d "%~dp0"
echo Installing Vault dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed. Make sure Node.js is installed.
    pause
    exit /b 1
)
echo.
echo Starting Vault...
call npm start
