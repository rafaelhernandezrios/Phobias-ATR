@echo off
REM Mock mode (no headset): HTTPS :8443 + MOCK recorder (synthetic EEG). For network/VR testing only.
REM No Python required. Researcher panel opens in browser automatically.
setlocal
cd /d "%~dp0"
call "%~dp0tools\use-portable-env.bat"
call "%~dp0setup-env.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
set OPEN_RESEARCHER=1
echo [run-experiment-mock] Starting in MOCK mode (no AURA) ...
"%NODE%" scripts\run-experiment.js --mock
endlocal
pause
