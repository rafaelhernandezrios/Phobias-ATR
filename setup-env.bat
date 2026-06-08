@echo off
REM Web stack only: Node deps + TLS cert. No PyQt, no Python (mock mode works with this alone).
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0tools\use-portable-env.bat"

"%NODE%" --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo [setup-env] Node.js not detected from this .bat window.
  echo.
  echo   If "node" works in your terminal, try ONE of these:
  echo   1^) Open cmd IN THIS FOLDER and run:  setup-env.bat
  echo   2^) Run:  prepare-usb.bat  ^(bundles Node into tools\node^)
  echo   3^) Install Node LTS from https://nodejs.org/  ^(check Add to PATH^)
  echo.
  echo   Also check: if tools\node exists but is broken, delete tools\node
  echo.
  endlocal
  exit /b 1
)

for /f "delims=" %%V in ('"%NODE%" --version 2^>nul') do set "NODE_VER=%%V"
echo [setup-env] Using Node %NODE_VER%
echo [setup-env] Path: %NODE%

REM node_modules from Mac/USB copy is often broken on Windows - check a real dependency.
if not exist "node_modules\express\package.json" (
  echo [setup-env] node_modules missing or incomplete - running npm install...
  if exist "node_modules\" (
    echo [setup-env] Tip: if install fails, run: rmdir /s /q node_modules
  )
  call "%NPM%" install
  if errorlevel 1 (
    echo [setup-env] npm install failed.
    endlocal
    exit /b 1
  )
)

if not exist "node_modules\selfsigned\package.json" (
  echo [setup-env] dev dependency selfsigned missing - running npm install...
  call "%NPM%" install
  if errorlevel 1 (
    echo [setup-env] npm install failed.
    endlocal
    exit /b 1
  )
)

if not exist "server\cert\cert.pem" (
  echo [setup-env] TLS cert not found - generating...
  "%NODE%" scripts\generate-cert.js
  if errorlevel 1 (
    echo [setup-env] cert generation failed.
    endlocal
    exit /b 1
  )
)

echo [setup-env] OK - web stack ready.
echo   Researcher panel: https://localhost:8443/researcher
endlocal
exit /b 0
