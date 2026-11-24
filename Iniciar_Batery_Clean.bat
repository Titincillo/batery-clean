@echo off
title Batery Clean - Lavado de Alta Energia
color 0B
echo =======================================================
echo   INICIANDO LAVANDERIA BATERY CLEAN - SISTEMA LOCAL
echo =======================================================
echo.
echo  Base de datos: batery_clean.db (100%% Offline)
echo  Abriendo la aplicacion en el navegador...
echo.

cd /d "%~dp0"

:: Start browser after 2 seconds delay
start "" timeout /t 2 /nobreak >nul & start http://localhost:3050

:: Start Node.js server
node server.js
pause
