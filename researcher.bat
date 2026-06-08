@echo off
REM Launch the native PyQt6 researcher panel.
REM On a new PC: auto-runs npm install + Python venv if missing (see setup-env.bat).
REM Optional args:  researcher.bat --host 192.168.16.115 --port 8443
setlocal
cd /d "%~dp0"
call "%~dp0setup-env.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

set "VENV_PY=%~dp0.venv\Scripts\python.exe"
"%VENV_PY%" scripts\researcher_qt.py %*
endlocal
