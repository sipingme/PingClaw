@echo off
setlocal EnableExtensions

rem PingClaw Portable launcher (Windows)
rem Double-click on USB to start with data stored in this folder.

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "DATA=%ROOT%\data"
set "PINGCLAW_DATA=%DATA%\pingclaw"
set "OPENCLAW_DATA=%DATA%\openclaw"

if not exist "%PINGCLAW_DATA%" mkdir "%PINGCLAW_DATA%"
if not exist "%OPENCLAW_DATA%" mkdir "%OPENCLAW_DATA%"

set "PINGCLAW_PORTABLE=1"
set "PINGCLAW_PORTABLE_ROOT=%ROOT%"
set "CLAWX_USER_DATA_DIR=%PINGCLAW_DATA%"
set "OPENCLAW_STATE_DIR=%OPENCLAW_DATA%"
set "OPENCLAW_CONFIG_PATH=%OPENCLAW_DATA%\openclaw.json"
set "PINGCLAW_GATEWAY_PORT=18889"
set "CLAWX_PORT_CLAWX_HOST_API=13211"

if exist "%ROOT%\PingClaw.exe" (
  start "" "%ROOT%\PingClaw.exe" --user-data-dir="%PINGCLAW_DATA%"
  exit /b 0
)

if exist "%ROOT%\PingClawPortable.exe" (
  start "" "%ROOT%\PingClawPortable.exe"
  exit /b 0
)

for %%F in ("%ROOT%\PingClawPortable-*.exe") do (
  start "" "%%~fF"
  exit /b 0
)

echo PingClaw.exe not found. Copy the Windows build next to this script.
echo See README.txt
pause
exit /b 1
