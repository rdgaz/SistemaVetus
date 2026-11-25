@echo off
rem AutoLaudoVet Transferencia: recebe os exames do ultrassom pelo cabo de rede (DICOM).
setlocal
cd /d "%~dp0"
call "%~dp0config.bat"

rem Sem plataforma: so recebe e processa no notebook (o envio para a nuvem vem depois)
set "PLATAFORMA_URL="
set "AE_LEGADO_CLINICA=%AE_TITLE%"
set "DATA_DIR=%USERPROFILE%\Documents\AutoLaudoVet"
set "APAGAR_ORIGINAIS=true"
set "TZ="

if not exist "%EXAMES_DIR%" mkdir "%EXAMES_DIR%"
if not exist "%~dp0logs" mkdir "%~dp0logs"

rem Ja esta rodando? (painel respondendo)
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PAINEL_PORTA%/api/status | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  echo O AutoLaudoVet Transferencia ja esta aberto: http://127.0.0.1:%PAINEL_PORTA%
  exit /b 0
)

echo AutoLaudoVet Transferencia - receptor ativo (feche esta janela para parar)
echo Painel: http://127.0.0.1:%PAINEL_PORTA%
echo Log:    %~dp0logs\receptor.log
"%~dp0node\node.exe" "%~dp0receptor\src\server.js" >> "%~dp0logs\receptor.log" 2>&1
