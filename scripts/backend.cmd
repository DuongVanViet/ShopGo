@echo off
setlocal
set "TASK=%~1"
if not defined TASK set "TASK=dev"
set "NPM_ARGS="
if /I "%TASK%"=="install" set "NPM_ARGS=ci"
if /I "%TASK%"=="build" set "NPM_ARGS=run build"
if /I "%TASK%"=="dev" set "NPM_ARGS=run start:dev"
if /I "%TASK%"=="migrate" set "NPM_ARGS=run db:migrate"
if /I "%TASK%"=="seed" set "NPM_ARGS=run db:seed"
if /I "%TASK%"=="worker" set "NPM_ARGS=run worker"
if /I "%TASK%"=="test" set "NPM_ARGS=test"
if not defined NPM_ARGS (
  echo Usage: backend.cmd [install^|build^|dev^|migrate^|seed^|worker^|test]
  exit /b 1
)
set "PORTABLE_NODE=%~dp0..\.tools\node-v22.14.0-win-x64"
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.14+ and npm are required. See backend\README.md.
  exit /b 1
)
pushd "%~dp0..\backend"
if errorlevel 1 exit /b 1
call npm.cmd %NPM_ARGS%
set "TASK_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %TASK_EXIT_CODE%
