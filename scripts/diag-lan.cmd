@echo off
REM Run this on the SERVER PC while run-experiment(-mock).bat is running.
REM Right-click -> Run as administrator for full output.
setlocal EnableDelayedExpansion
echo ==============================================================
echo  VR Phobia IKAN -- LAN diagnostic
echo ==============================================================
echo.

echo [1] LAN IPv4 addresses on this PC:
echo     (the Quest must use one of these to reach the server)
echo --------------------------------------------------------------
ipconfig | findstr /R /C:"adapter" /C:"IPv4"
echo.

echo [2] Listening sockets on TCP 8443:
echo     (expected: 0.0.0.0:8443  LISTENING)
echo --------------------------------------------------------------
netstat -an | findstr ":8443"
echo.

echo [3] Current network profile (Public blocks inbound by default):
echo --------------------------------------------------------------
powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object Name,InterfaceAlias,NetworkCategory | Format-Table -AutoSize"
echo.

echo [4] Firewall rules matching our app or 8443:
echo --------------------------------------------------------------
netsh advfirewall firewall show rule name="VR Phobia IKAN HTTPS 8443" 2>nul | findstr /C:"Enabled" /C:"Direction" /C:"Profiles" /C:"LocalPort" /C:"Action"
echo.

echo [5] Quick reachability test (server-side):
echo --------------------------------------------------------------
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri https://127.0.0.1:8443/ -SkipCertificateCheck -TimeoutSec 3).StatusCode } catch { Write-Host 'localhost test FAILED:' $_.Exception.Message }"
echo.

echo [6] Suggested next test FROM ANOTHER DEVICE on the same Wi-Fi:
echo --------------------------------------------------------------
echo    1. ping ^<one of the IPv4 addresses listed in [1]^>
echo    2. open https://^<that IP^>:8443/  in a browser
echo.
echo    If ping fails:  router has AP/client isolation, or different subnet.
echo                     -> use a hotspot/portable router (see README).
echo    If ping works but browser fails:  firewall on server.
echo                     -> set Wi-Fi profile to Private and re-run open-firewall-windows.cmd
echo                     -> as last resort: netsh advfirewall set allprofiles state off
echo                        (temporary, RE-ENABLE with 'on' after testing)
echo.
echo ==============================================================
pause
