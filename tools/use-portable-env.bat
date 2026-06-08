@echo off
REM Prefer bundled Node.js (USB / locked-down PCs). Falls back to system PATH.
set "NODE=node"
set "NPM=npm"
if exist "%~dp0node\node.exe" (
  set "NODE=%~dp0node\node.exe"
  set "NPM=%~dp0node\npm.cmd"
  set "PATH=%~dp0node;%PATH%"
)
