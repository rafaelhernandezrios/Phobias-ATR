@echo off
REM Windows setup for a new lab PC: npm install + Python venv + pip deps.
REM Requires: Node.js + Python 3.10-3.13 (3.11 recommended).
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [setup-env] Node.js not found.
  echo   Install from https://nodejs.org/  then re-run this script.
  endlocal
  exit /b 1
)

where py >nul 2>&1
if errorlevel 1 (
  where python >nul 2>&1
  if errorlevel 1 (
    echo [setup-env] Python not found.
    echo   Install Python 3.11 from https://www.python.org/downloads/windows/
    echo   Check "Add python.exe to PATH" during install.
    echo   Tip: disable the Microsoft Store python alias in Windows Settings.
    endlocal
    exit /b 1
  )
)

if not exist "node_modules\" (
  echo [setup-env] node_modules not found — running npm install...
  call npm install
  if errorlevel 1 (
    echo [setup-env] npm install failed.
    endlocal
    exit /b 1
  )
)

REM Always run setup:python (creates .venv if missing; pip install is idempotent).
echo [setup-env] Ensuring Python venv and deps...
call npm run setup:python
if errorlevel 1 (
  echo [setup-env] setup:python failed.
  echo   If a previous run failed halfway, delete .venv and retry:
  echo     rmdir /s /q .venv
  echo     setup-env.bat
  endlocal
  exit /b 1
)

echo [setup-env] OK — ready for run-experiment.bat / researcher.bat
endlocal
exit /b 0
