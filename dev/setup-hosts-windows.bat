@echo off
REM ######################################################
REM Hydra SAML Auth - Windows Hosts File Setup
REM ######################################################
REM
REM This script must be run as Administrator
REM Right-click and select "Run as Administrator"
REM
REM ######################################################

echo Hydra SAML Auth - Windows Hosts File Setup
echo.

REM Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires Administrator privileges!
    echo Please right-click this file and select "Run as Administrator"
    pause
    exit /b 1
)

echo Running with Administrator privileges...
echo.

set HOSTS_FILE=%SystemRoot%\System32\drivers\etc\hosts

REM Check if entries already exist
findstr /C:"hydra.local" "%HOSTS_FILE%" >nul 2>&1
if %errorLevel% equ 0 (
    echo Local domains already configured in hosts file
    echo.
    pause
    exit /b 0
)

echo Adding local domains to hosts file...
echo.

REM Backup hosts file
copy "%HOSTS_FILE%" "%HOSTS_FILE%.backup.%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%" >nul 2>&1

REM Add entries
echo # Hydra SAML Auth Development>> "%HOSTS_FILE%"
echo 127.0.0.1 hydra.local>> "%HOSTS_FILE%"
echo 127.0.0.1 gpt.hydra.local>> "%HOSTS_FILE%"
echo 127.0.0.1 n8n.hydra.local>> "%HOSTS_FILE%"
echo 127.0.0.1 traefik.hydra.local>> "%HOSTS_FILE%"

echo SUCCESS: Local domains added to hosts file!
echo.
echo The following entries were added:
echo   127.0.0.1 hydra.local
echo   127.0.0.1 gpt.hydra.local
echo   127.0.0.1 n8n.hydra.local
echo   127.0.0.1 traefik.hydra.local
echo.
echo A backup of your hosts file was created.
echo.

pause
