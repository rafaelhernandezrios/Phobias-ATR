@echo off
REM Forces every active network profile to "Private" so Windows allows inbound
REM connections on port 8443 from other devices on the same Wi-Fi.
REM Run as Administrator.
echo Setting all active networks to Private...
powershell -NoProfile -Command "Get-NetConnectionProfile | ForEach-Object { Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private; Write-Host ('  ' + $_.Name + ' -> Private') }"
if errorlevel 1 (
  echo.
  echo ERROR: run this script as Administrator.
  pause
  exit /b 1
)
echo.
echo Done. Current profiles:
powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object Name,InterfaceAlias,NetworkCategory | Format-Table -AutoSize"
pause
