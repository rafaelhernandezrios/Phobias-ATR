@echo off
REM Run this on the SERVER PC while run-experiment(-mock).bat is running.
REM Right-click -> Run as administrator for the firewall section to show full data.
setlocal
echo ===============================================
echo  VR Phobia IKAN -- LAN diagnostic
echo ===============================================
echo.
echo [1] LAN IPv4 addresses on this PC:
ipconfig | findstr /C:"IPv4"
echo.
echo [2] Is anything listening on TCP 8443?
netstat -an | findstr ":8443"
echo    (expected: 0.0.0.0:8443  LISTENING)
echo.
echo [3] Active network profile (Public blocks inbound by default):
netsh advfirewall show currentprofile | findstr /C:"State" /C:"Profile"
powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object Name,InterfaceAlias,NetworkCategory | Format-Table -AutoSize"
echo.
echo [4] Firewall rules matching 8443:
netsh advfirewall firewall show rule name=all ^| findstr /C:"VR Phobia" /C:"8443"
echo.
echo [5] Hyper-V / WSL / VPN adapters (can shadow your real Wi-Fi IP):
ipconfig | findstr /C:"adapter"
echo.
echo ===============================================
echo  Now from ANOTHER device on the same Wi-Fi run:
echo     ping ^<the IPv4 above^>
echo     and open https://^<that IP^>:8443/  in a browser
echo ===============================================
pause
