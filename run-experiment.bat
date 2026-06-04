@echo off
REM Launch REAL session with AURA: HTTPS :8443 + Python recorder reading LSL "AURA".
REM Prerequisites: AURA headset powered on and its software publishing the LSL stream BEFORE running this.
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
echo [run-experiment] Starting with AURA (LSL) ...
node scripts\run-experiment.js
endlocal
pause
