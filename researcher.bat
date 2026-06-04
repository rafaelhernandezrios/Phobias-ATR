@echo off
REM Launch the native PyQt6 researcher panel.
REM Requires:  npm run setup:python  (once, to install PyQt6 in the venv)
REM Optional args:  researcher.bat --host 192.168.16.115 --port 8443
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

set "VENV_PY=%~dp0.venv\Scripts\python.exe"
if exist "%VENV_PY%" (
  "%VENV_PY%" scripts\researcher_qt.py %*
) else (
  echo [researcher] venv not found. Run:  npm run setup:python
  pause
  exit /b 1
)
endlocal
