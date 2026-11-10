@echo off
chcp 65001 >nul
title TikSoda
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado.
  echo  Baixe a versao LTS em https://nodejs.org e depois abra este arquivo de novo.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias, so na primeira vez...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar. Veja a mensagem acima.
    pause
    exit /b 1
  )
)

start "" http://localhost:3330/painel/
node src/server.js
pause
