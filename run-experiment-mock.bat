@echo off
REM Mock mode (no headset): HTTPS :8443 + MOCK recorder (synthetic EEG). For network/VR testing only.
REM On a new PC: auto-runs npm install + Python venv if missing (see setup-env.bat).
setlocal
cd /d "%~dp0"
call "%~dp0setup-env.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
echo [run-experiment-mock] Starting in MOCK mode (no AURA) ...
node scripts\run-experiment.js --mock
endlocal
pause
