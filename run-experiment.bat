@echo off
REM Lanza sesión REAL con AURA: HTTPS :8443 + recorder Python leyendo LSL "AURA".
REM Pre-requisitos: AURA encendido y software publicando el stream LSL antes de ejecutar.
setlocal
cd /d "%~dp0"
echo [run-experiment] Iniciando con AURA (LSL) ...
node scripts\run-experiment.js
endlocal
pause
