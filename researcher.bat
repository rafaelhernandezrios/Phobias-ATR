@echo off
REM Open the web researcher panel in the default browser (no PyQt, no Electron).
REM Start run-experiment.bat first, or this only opens the URL.
setlocal
cd /d "%~dp0"
set "URL=https://localhost:8443/researcher"
echo [researcher] Opening %URL%
echo   If the page does not load, run run-experiment.bat or run-experiment-mock.bat first.
start "" "%URL%"
endlocal
