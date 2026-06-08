@echo off
REM Web stack only: Node deps + TLS cert. No PyQt, no Python (mock mode works with this alone).
setlocal
cd /d "%~dp0"
call "%~dp0tools\use-portable-env.bat"

"%NODE%" --version >nul 2>&1
if errorlevel 1 (
  where node >nul 2>&1
  if errorlevel 1 (
    echo [setup-env] Node.js not found.
    echo   Option A: run prepare-usb.bat on a PC with internet ^(bundles Node to tools\node^)
    echo   Option B: install Node from https://nodejs.org/
    endlocal
    exit /b 1
  )
)

if not exist "node_modules\" (
  echo [setup-env] node_modules not found — running npm install...
  call "%NPM%" install
  if errorlevel 1 (
    echo [setup-env] npm install failed.
    endlocal
    exit /b 1
  )
)

if not exist "server\cert\cert.pem" (
  echo [setup-env] TLS cert not found — generating...
  call "%NPM%" run cert
  if errorlevel 1 (
    echo [setup-env] cert generation failed.
    endlocal
    exit /b 1
  )
)

echo [setup-env] OK — web stack ready.
echo   Researcher panel: https://localhost:8443/researcher
endlocal
exit /b 0
