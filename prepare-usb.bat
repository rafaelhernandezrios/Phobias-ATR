@echo off
REM Run ONCE on a Windows PC WITH internet. Then copy this whole folder to USB.
REM The lab PC only needs to double-click run-experiment-mock.bat or run-experiment.bat — no downloads.
setlocal
cd /d "%~dp0"

echo ============================================================
echo  Preparing VR Phobia IKAN for offline USB / locked-down PC
echo ============================================================
echo.

call "%~dp0tools\use-portable-env.bat"
where node >nul 2>&1
if errorlevel 1 (
  echo [prepare-usb] System Node not found — will download portable Node to tools\node\
  if not exist "tools\node\node.exe" (
    echo [prepare-usb] Downloading Node.js LTS portable...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$v='22.14.0'; $zip=\"node-v$v-win-x64.zip\"; $url=\"https://nodejs.org/dist/v$v/$zip\"; $dst='tools'; New-Item -ItemType Directory -Force -Path $dst | Out-Null; $zipPath=Join-Path $dst $zip; Invoke-WebRequest -Uri $url -OutFile $zipPath; Expand-Archive -Path $zipPath -DestinationPath $dst -Force; $dir=Join-Path $dst \"node-v$v-win-x64\"; if (Test-Path 'tools\node') { Remove-Item -Recurse -Force 'tools\node' }; Rename-Item $dir 'node'; Remove-Item $zipPath"
    if errorlevel 1 (
      echo [prepare-usb] Could not download Node. Install Node manually and re-run.
      pause
      exit /b 1
    )
  )
  call "%~dp0tools\use-portable-env.bat"
)

echo [prepare-usb] 1/4 Node:
"%NODE%" --version

echo [prepare-usb] 2/4 npm install...
call "%NPM%" install
if errorlevel 1 goto :fail

echo [prepare-usb] 3/4 TLS certificate...
if not exist "server\cert\cert.pem" call "%NPM%" run cert
if errorlevel 1 goto :fail

echo [prepare-usb] 4/4 Python venv for AURA ^(optional, skip with Ctrl+C if mock-only^)...
call "%NPM%" run setup:python
if errorlevel 1 (
  echo [prepare-usb] Python setup failed — OK if you only use MOCK mode.
)

echo. > ".usb-ready"
echo.
echo ============================================================
echo  USB READY
echo  Copy this entire folder to the USB drive.
echo  On the lab PC:
echo    - Mock test:  run-experiment-mock.bat
echo    - Real AURA:  run-experiment.bat
echo    - Panel only: researcher.bat ^(opens browser^)
echo  Panel URL: https://localhost:8443/researcher
echo ============================================================
pause
endlocal
exit /b 0

:fail
echo [prepare-usb] FAILED.
pause
exit /b 1
