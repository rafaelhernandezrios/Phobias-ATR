@echo off
REM AURA/LSL recorder only (Python). Run after setup-env.bat. Not needed for mock mode.
setlocal
cd /d "%~dp0"
call "%~dp0tools\use-portable-env.bat"
call "%~dp0setup-env.bat"
if errorlevel 1 exit /b 1

where py >nul 2>&1
if errorlevel 1 (
  where python >nul 2>&1
  if errorlevel 1 (
    echo [setup-aura] Python not found - required only for real AURA sessions.
    echo   Mock mode (run-experiment-mock.bat) does NOT need Python.
    echo   Install Python 3.11 from https://www.python.org/downloads/windows/
    endlocal
    exit /b 1
  )
)

echo [setup-aura] Ensuring Python venv for AURA recorder...
"%NODE%" scripts\setup-python.js
if errorlevel 1 (
  echo [setup-aura] failed. Try: rmdir /s /q .venv  then setup-aura.bat
  endlocal
  exit /b 1
)

echo [setup-aura] OK.
endlocal
exit /b 0
