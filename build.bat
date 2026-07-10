@echo off
cd /d "%~dp0"
echo Building Vault EXE...
call npm install
call npm run build
echo Done. Check the dist folder.
pause
