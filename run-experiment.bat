@echo off
REM Launch REAL session with AURA: HTTPS :8443 + Python recorder reading LSL "AURA".
REM Prerequisites: AURA headset powered on and its software publishing the LSL stream BEFORE running this.
REM On a new PC: auto-runs npm install + Python venv if missing (see setup-env.bat).
setlocal
cd /d "%~dp0"
call "%~dp0setup-env.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
echo [run-experiment] Starting with AURA (LSL) ...
node scripts\run-experiment.js
endlocal
pause
