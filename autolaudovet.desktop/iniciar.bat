@echo off
rem AutoLaudoVet Desktop: recebe os exames do ultrassom pelo cabo de rede (DICOM).
setlocal
cd /d "%~dp0"
set "AE_TITLE="
call "%~dp0config.bat"

rem AE Title obrigatorio: so letras, numeros e _ (ate 16), ex.: ALV_C0002
echo(%AE_TITLE%| findstr /r /x "[A-Za-z0-9_][A-Za-z0-9_]*" >nul || goto aeInvalido
if not "%AE_TITLE:~16%"=="" goto aeInvalido

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
  echo O AutoLaudoVet Desktop ja esta aberto: http://127.0.0.1:%PAINEL_PORTA%
  exit /b 0
)

rem log preso por outra copia aberta (ex.: aberta como administrador)? usa outro arquivo
set "LOG=%~dp0logs\receptor.log"
2>nul (>>"%LOG%" type nul) || set "LOG=%~dp0logs\receptor-%RANDOM%.log"

echo AutoLaudoVet Desktop - receptor ativo (feche esta janela para parar)
echo Painel: http://127.0.0.1:%PAINEL_PORTA%
echo Log:    %LOG%
"%~dp0node\node.exe" "%~dp0receptor\src\server.js" >> "%LOG%" 2>&1
exit /b

:aeInvalido
echo AE Title nao configurado no config.bat. A linha deve ser:  set "AE_TITLE=ALV_C0002"
powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show('O AE Title da clinica nao esta configurado no config.bat.' + [char]10 + [char]10 + 'Abra o config.bat no Bloco de Notas e deixe a linha assim (trocando pelo AE da clinica):' + [char]10 + [char]10 + 'set \"AE_TITLE=ALV_C0002\"', 'AutoLaudoVet Desktop', 'OK', 'Warning')"
exit /b 1
