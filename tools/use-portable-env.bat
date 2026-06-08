@echo off
REM Find a working node.exe + npm.cmd (portable USB, PATH, or standard install dirs).
REM Refreshes PATH from registry so double-click .bat works like an open terminal.

set "NODE="
set "NPM="

REM Reload PATH (Explorer/double-click often has stale PATH vs an open terminal).
set "SYSPATH="
set "USERPATH="
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYSPATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USERPATH=%%B"
if defined USERPATH if defined SYSPATH set "PATH=%USERPATH%;%SYSPATH%"
if defined USERPATH if not defined SYSPATH set "PATH=%USERPATH%"
if not defined USERPATH if defined SYSPATH set "PATH=%SYSPATH%"

REM 1) Bundled portable Node (USB) - only if it actually runs.
if exist "%~dp0node\node.exe" (
  "%~dp0node\node.exe" --version >nul 2>&1
  if not errorlevel 1 (
    set "NODE=%~dp0node\node.exe"
    set "NPM=%~dp0node\npm.cmd"
    set "PATH=%~dp0node;%PATH%"
    goto :done
  )
)

REM 2) node on refreshed PATH.
for /f "delims=" %%F in ('where node 2^>nul') do (
  "%%F" --version >nul 2>&1
  if not errorlevel 1 (
    set "NODE=%%F"
    if exist "%%~dpFnpm.cmd" (
      set "NPM=%%~dpFnpm.cmd"
    ) else (
      set "NPM=npm"
    )
    set "PATH=%%~dpF;%PATH%"
    goto :done
  )
)

REM 3) Common Windows install folders (when PATH is still stale).
for %%D in ("%ProgramFiles%\nodejs" "%LocalAppData%\Programs\node" "%ProgramFiles(x86)%\nodejs") do (
  if exist "%%~D\node.exe" (
    "%%~D\node.exe" --version >nul 2>&1
    if not errorlevel 1 (
      set "NODE=%%~D\node.exe"
      set "NPM=%%~D\npm.cmd"
      set "PATH=%%~D;%PATH%"
      goto :done
    )
  )
)

REM Fallback - setup script will report a clear error.
set "NODE=node"
set "NPM=npm"

:done
