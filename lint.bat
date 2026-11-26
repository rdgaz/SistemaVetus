@echo off
rem ============================================================================================
rem  Lint do AutoLaudoVet (o mesmo do deploy e do GitHub). Rode quando quiser conferir o código:
rem     lint.bat            front (Biome + TypeScript) e API (.NET sem avisos + analisadores)
rem     lint.bat front      so o front
rem     lint.bat api        so a API
rem ============================================================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "ALVO=%~1"
set "FALHOU="

if /i not "%ALVO%"=="api" (
  echo.
  echo === Front: lint (Biome^) ===
  pushd plataforma\front
  call npm run lint || set "FALHOU=1"
  echo.
  echo === Front: TypeScript ===
  call npx tsc --noEmit || set "FALHOU=1"
  popd
)

if /i not "%ALVO%"=="front" (
  echo.
  echo === API: compila sem avisos ===
  dotnet build plataforma\api -warnaserror -nologo -v q || set "FALHOU=1"
  echo.
  echo === API: analisadores do .NET ===
  dotnet format analyzers plataforma\api --verify-no-changes --severity error --no-restore || set "FALHOU=1"
)

echo.
if defined FALHOU (
  echo === Lint com problemas: veja as mensagens acima.
  endlocal
  exit /b 1
)
echo === Lint sem problemas.
endlocal
exit /b 0
