@echo off
REM Abre TCP 8443 (HTTPS) en el firewall de Windows para perfil privado.
REM Ejecutar como Administrador.
echo Abriendo puerto 8443 (TCP, perfil privado) en el firewall de Windows...
netsh advfirewall firewall add rule name="VR Phobia IKAN HTTPS 8443" dir=in action=allow protocol=TCP localport=8443 profile=private
if errorlevel 1 (
  echo ERROR: ejecutar este script como Administrador.
  pause
  exit /b 1
)
echo OK. Regla creada.
pause
