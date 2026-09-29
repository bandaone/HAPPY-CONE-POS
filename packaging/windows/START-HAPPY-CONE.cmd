@echo off
setlocal
title Happy Cone setup

>nul 2>&1 "%SystemRoot%\System32\cacls.exe" "%SystemRoot%\System32\config\system"
if errorlevel 1 (
    echo Requesting Administrator access...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-HappyConeSetup.ps1"
set "setup_exit=%errorlevel%"
echo.
if not "%setup_exit%"=="0" echo Setup stopped before completion. Read the message above, correct the listed item, then double-click this file again.
pause
exit /b %setup_exit%
