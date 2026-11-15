@echo off
setlocal
set "TASK=%~1"
if not defined TASK set "TASK=dev"
set "NPM_ARGS="
if /I "%TASK%"=="install" set "NPM_ARGS=ci"
if /I "%TASK%"=="dev" set "NPM_ARGS=run dev"
if /I "%TASK%"=="build" set "NPM_ARGS=run build"
if /I "%TASK%"=="start" set "NPM_ARGS=run start"
if /I "%TASK%"=="typecheck" set "NPM_ARGS=run typecheck"
if /I "%TASK%"=="test" set "NPM_ARGS=run test:e2e"
if not defined NPM_ARGS (
  echo Usage: frontend.cmd [install^|dev^|build^|start^|typecheck^|test]
  exit /b 1
)
set "PORTABLE_NODE=%~dp0..\.tools\node-v22.14.0-win-x64"
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.14+ and npm are required. See frontend\README.md.
  exit /b 1
)
pushd "%~dp0..\frontend"
if errorlevel 1 exit /b 1
call npm.cmd %NPM_ARGS%
set "TASK_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %TASK_EXIT_CODE%
