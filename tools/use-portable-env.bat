@echo off
REM Resolve node.exe + npm.cmd from the same install (never use a broken node_modules\npm).
set "NODE=node"
set "NPM=npm"

if exist "%~dp0node\node.exe" (
  set "NODE=%~dp0node\node.exe"
  set "NPM=%~dp0node\npm.cmd"
  set "PATH=%~dp0node;%PATH%"
  goto :eof
)

for /f "delims=" %%F in ('where node 2^>nul') do (
  set "NODE=%%F"
  set "NPM=%%~dpFnpm.cmd"
  goto :eof
)
