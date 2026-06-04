@echo off
REM Modo demo sin casco: HTTPS :8443 + recorder MOCK (EEG sintético). Solo pruebas de red/VR.
setlocal
cd /d "%~dp0"
echo [run-experiment-mock] Iniciando en modo MOCK (sin AURA) ...
node scripts\run-experiment.js --mock
endlocal
pause
