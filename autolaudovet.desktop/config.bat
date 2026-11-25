@echo off
rem ============================================================
rem  AutoLaudoVet Desktop - configuracao
rem  Edite so os valores abaixo (sem espacos em volta do =).
rem ============================================================

rem AE Title da clinica (o mesmo configurado no ultrassom), ex.: ALV_C0002
set "AE_TITLE=ALV_C0002"

rem Porta DICOM (a mesma do ultrassom)
set "DICOM_PORT=2345"

rem IP fixo do notebook na placa de rede do cabo (o ultrassom usa 10.77.0.2)
set "IP_CABO=10.77.0.1"

rem Pasta onde os exames ficam (fotos, PDF e medidas)
set "EXAMES_DIR=%USERPROFILE%\Documents\AutoLaudoVet\Exames"

rem Porta do painel (abrir http://127.0.0.1:23460 no navegador)
set "PAINEL_PORTA=23460"

rem Segundos sem receber imagens para considerar o exame completo
set "IDLE_SECONDS=5"
