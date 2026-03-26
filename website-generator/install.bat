@echo off
title Website Generator - Installer
color 0B
echo.
echo  ====================================================
echo     Website Generator - One-Click Installer
echo  ====================================================
echo.
echo  This will set up your personal website builder.
echo  The AI handles all the coding — you just describe
echo  what you want in plain English.
echo.
echo  Two ways to install:
echo.
echo    [1] Run the GUI installer (recommended)
echo        Requires: Inno Setup (will install if missing)
echo.
echo    [2] Run the console installer (no extra software)
echo        Interactive PowerShell wizard
echo.
echo    [3] Exit
echo.
set /p choice="  Choose [1/2/3]: "

if "%choice%"=="1" (
    echo.
    echo  Building and launching GUI installer...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\build.ps1"
    if exist "%~dp0installer\output\WebsiteGenerator-Setup.exe" (
        start "" "%~dp0installer\output\WebsiteGenerator-Setup.exe"
    ) else (
        echo  GUI installer build failed. Falling back to console installer...
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\standalone-install.ps1"
    )
) else if "%choice%"=="2" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\standalone-install.ps1"
) else if "%choice%"=="3" (
    exit
) else (
    echo  Invalid choice. Please run again.
)

echo.
pause
