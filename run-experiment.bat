@echo off
REM Launch REAL session with AURA: HTTPS :8443 + Python recorder reading LSL "AURA".
REM Prerequisites: AURA headset powered on and its software publishing the LSL stream BEFORE running this.
REM Researcher panel: web browser at https://localhost:8443/researcher (opens automatically).
setlocal
cd /d "%~dp0"
call "%~dp0tools\use-portable-env.bat"
call "%~dp0setup-aura.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set OPEN_RESEARCHER=1
echo [run-experiment] Starting with AURA (LSL) ...
"%NODE%" scripts\run-experiment.js
endlocal
pause
