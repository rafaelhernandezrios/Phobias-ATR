@echo off
REM Abre TCP 8443 (HTTPS) en el firewall de Windows para TODOS los perfiles.
REM Ejecutar como Administrador (clic derecho -> Ejecutar como administrador).
echo Comprobando regla existente...
netsh advfirewall firewall delete rule name="VR Phobia IKAN HTTPS 8443" >nul 2>&1

echo Abriendo puerto 8443 (TCP, perfiles: domain,private,public)...
netsh advfirewall firewall add rule name="VR Phobia IKAN HTTPS 8443" dir=in action=allow protocol=TCP localport=8443 profile=any
if errorlevel 1 (
  echo.
  echo ERROR: ejecutar este script como Administrador.
  pause
  exit /b 1
)
echo.
echo OK. Regla creada para todos los perfiles de red.
echo.
echo Perfil actual de tus redes:
netsh advfirewall show currentprofile | findstr /C:"Estado" /C:"State"
pause
