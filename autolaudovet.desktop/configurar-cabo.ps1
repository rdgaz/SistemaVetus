# AutoLaudoVet Desktop - configura o cabo de rede direto com o ultrassom (rodar UMA vez).
#
# O que faz:
#  - IP fixo (padrao 10.77.0.1/24) SO na placa de rede com fio escolhida, sem gateway e sem DNS.
#    O Wi-Fi nao e tocado: continua automatico e a internet continua saindo por ele (ou pelo celular).
#  - Libera no firewall a porta DICOM (2345) so para o ultrassom (10.77.0.x) e so nessa placa.
#  - Cria o inicio automatico com o Windows e o atalho "AutoLaudoVet Desktop" na area de trabalho.
#
# Uso: clique com o botao direito > "Executar com o PowerShell" (pede permissao de administrador).
# Para desfazer: desfazer-cabo.ps1

$ErrorActionPreference = 'Stop'
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---------------------------------------------------------------- administrador
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -Usuario `"$env:USERPROFILE`""
    exit
}

# pasta do usuario que pediu (a elevacao pode trocar de usuario): atalhos vao para ele
$usuario = $env:USERPROFILE
for ($i = 0; $i -lt $args.Count - 1; $i++) { if ($args[$i] -eq '-Usuario') { $usuario = $args[$i + 1] } }

function Pausar { Write-Host ''; Read-Host 'Pressione Enter para fechar' | Out-Null }

try {
    # ------------------------------------------------------------ config.bat
    $cfg = @{}
    foreach ($l in Get-Content (Join-Path $pasta 'config.bat')) {
        if ($l -match '^\s*set\s+"?([A-Z_]+)=([^"]*)"?\s*$') { $cfg[$Matches[1]] = $Matches[2] }
    }
    if ($cfg['AE_TITLE'] -notmatch '^[A-Za-z0-9_]{1,16}$') {
        Write-Host 'O AE Title da clinica nao esta configurado no config.bat.' -ForegroundColor Red
        Write-Host 'Abra o config.bat no Bloco de Notas e deixe a linha assim (trocando pelo AE da clinica):'
        Write-Host '    set "AE_TITLE=ALV_C0002"' -ForegroundColor Yellow
        Write-Host 'Depois rode este script de novo.'
        Pausar; exit 1
    }
    $ip = if ($cfg['IP_CABO']) { $cfg['IP_CABO'] } else { '10.77.0.1' }
    $porta = if ($cfg['DICOM_PORT']) { [int]$cfg['DICOM_PORT'] } else { 2345 }
    $rede = ($ip -replace '\.\d+$', '.0') + '/24'
    $aparelho = $ip -replace '\.\d+$', '.2'

    Write-Host '=============================================='
    Write-Host ' AutoLaudoVet Desktop - configurar o cabo'
    Write-Host '=============================================='

    # ------------------------------------------------------------ placa com fio
    $placas = @(Get-NetAdapter -Physical | Where-Object {
        $_.PhysicalMediaType -notmatch '802\.11|Wireless|Bluetooth' -and $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|Bluetooth|Virtual|Hyper-V|VPN'
    } | Sort-Object Name)
    if ($placas.Count -eq 0) {
        Write-Host 'Nenhuma placa de rede com fio encontrada.' -ForegroundColor Red
        Write-Host 'Se o notebook nao tem porta de rede, ligue o adaptador USB-Ethernet e rode de novo.'
        Pausar; exit 1
    }
    if ($placas.Count -eq 1) {
        $placa = $placas[0]
    } else {
        Write-Host 'Placas de rede com fio:'
        for ($i = 0; $i -lt $placas.Count; $i++) {
            Write-Host ("  {0}) {1}  ({2}, {3})" -f ($i + 1), $placas[$i].Name, $placas[$i].InterfaceDescription, $placas[$i].Status)
        }
        $n = Read-Host 'Numero da placa ligada ao ultrassom'
        $placa = $placas[[int]$n - 1]
        if (-not $placa) { throw 'Opcao invalida.' }
    }
    $idx = $placa.ifIndex
    Write-Host "Placa: $($placa.Name) ($($placa.InterfaceDescription))"

    # outra placa ja usa esse IP?
    $outro = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $ip -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceIndex -ne $idx }
    if ($outro) { throw "O IP $ip ja esta em outra placa ($($outro.InterfaceAlias)). Rode desfazer-cabo.ps1 primeiro." }

    # ------------------------------------------------------------ IP fixo so nesta placa
    Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Disabled -InterfaceMetric 500
    Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
    Get-NetRoute -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
    New-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -IPAddress $ip -PrefixLength 24 | Out-Null   # sem gateway
    Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses
    Set-DnsClient -InterfaceIndex $idx -RegisterThisConnectionsAddress $false
    Write-Host "IP fixo $ip/24 na placa $($placa.Name), sem gateway (a internet continua pelo Wi-Fi)." -ForegroundColor Green

    # ------------------------------------------------------------ firewall
    $grupo = 'AutoLaudoVet Desktop'
    Get-NetFirewallRule -Group $grupo -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    $node = Join-Path $pasta 'node\node.exe'
    # o Windows cria regras de BLOQUEIO se alguem clicar "Cancelar" no aviso do firewall: remove as do nosso node.exe
    Get-NetFirewallApplicationFilter -Program $node -ErrorAction SilentlyContinue | Get-NetFirewallRule |
        Where-Object { $_.Action -eq 'Block' } | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName 'AutoLaudoVet Desktop - DICOM do ultrassom' -Group $grupo -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort $porta -RemoteAddress $rede -InterfaceAlias $placa.Name -Program $node -Profile Any | Out-Null
    Write-Host "Firewall: porta $porta liberada so para $rede na placa $($placa.Name)." -ForegroundColor Green

    # ------------------------------------------------------------ atalhos
    $sh = New-Object -ComObject WScript.Shell
    $vbs = Join-Path $pasta 'iniciar-oculto.vbs'
    $inicio = Join-Path $usuario 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\AutoLaudoVet Desktop.lnk'
    $mesa = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AutoLaudoVet Desktop.lnk'
    if ($usuario -ne $env:USERPROFILE) { $mesa = Join-Path $usuario 'Desktop\AutoLaudoVet Desktop.lnk' }
    foreach ($a in @(@{ f = $inicio; arg = "`"$vbs`"" }, @{ f = $mesa; arg = "`"$vbs`" /painel" })) {
        New-Item -ItemType Directory -Force (Split-Path $a.f) | Out-Null
        $l = $sh.CreateShortcut($a.f)
        $l.TargetPath = "$env:WINDIR\System32\wscript.exe"
        $l.Arguments = $a.arg
        $l.WorkingDirectory = $pasta
        $l.Description = 'AutoLaudoVet Desktop: recebe os exames do ultrassom pelo cabo de rede'
        $l.Save()
    }
    Write-Host 'Atalhos criados: area de trabalho e inicio automatico com o Windows.' -ForegroundColor Green

    Write-Host ''
    Write-Host '=============================================='
    Write-Host ' Pronto. Agora, no ultrassom (uma vez so):'
    Write-Host "   Rede:   IP $aparelho   mascara 255.255.255.0   gateway em branco"
    Write-Host "   DICOM Storage:  IP $ip   porta $porta   AE Title $($cfg['AE_TITLE'])"
    Write-Host '   Use "Verificar" (Verify) no aparelho para testar.'
    Write-Host '=============================================='

    # abre pelo atalho via Explorer: o programa roda como usuario comum (nao como administrador)
    Start-Process explorer.exe -ArgumentList "`"$mesa`""
} catch {
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    Pausar; exit 1
}
Pausar
