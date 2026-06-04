@echo off
REM Mock mode (no headset): HTTPS :8443 + MOCK recorder (synthetic EEG). For network/VR testing only.
setlocal
cd /d "%~dp0"
echo [run-experiment-mock] Starting in MOCK mode (no AURA) ...
node scripts\run-experiment.js --mock
endlocal
pause
