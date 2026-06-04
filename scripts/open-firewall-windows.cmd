@echo off
REM Open TCP 8443 (HTTPS) in Windows Firewall for ALL profiles.
REM Run as Administrator (right-click -> Run as administrator).
echo Checking for existing rule...
netsh advfirewall firewall delete rule name="VR Phobia IKAN HTTPS 8443" >nul 2>&1

echo Opening port 8443 (TCP, profiles: domain,private,public)...
netsh advfirewall firewall add rule name="VR Phobia IKAN HTTPS 8443" dir=in action=allow protocol=TCP localport=8443 profile=any
if errorlevel 1 (
  echo.
  echo ERROR: run this script as Administrator.
  pause
  exit /b 1
)
echo.
echo OK. Rule created for all network profiles.
echo.
echo Current network profile:
netsh advfirewall show currentprofile | findstr /C:"State"
pause
