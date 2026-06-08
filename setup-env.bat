@echo off
REM First-time / new machine: npm install + Python venv + pip deps (via setup-python.js).
setlocal
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [setup-env] node_modules not found — running npm install...
  call npm install
  if errorlevel 1 (
    echo [setup-env] npm install failed.
    endlocal
    exit /b 1
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo [setup-env] .venv not found — creating venv and installing Python deps...
  call npm run setup:python
  if errorlevel 1 (
    echo [setup-env] setup:python failed.
    endlocal
    exit /b 1
  )
)

echo [setup-env] OK.
endlocal
exit /b 0
