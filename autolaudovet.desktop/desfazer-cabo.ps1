# AutoLaudoVet Desktop - desfaz o configurar-cabo.ps1:
# volta a placa do cabo para IP automatico (DHCP), remove a regra do firewall e os atalhos.

$ErrorActionPreference = 'Stop'
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -Usuario `"$env:USERPROFILE`""
    exit
}
$usuario = $env:USERPROFILE
for ($i = 0; $i -lt $args.Count - 1; $i++) { if ($args[$i] -eq '-Usuario') { $usuario = $args[$i + 1] } }

try {
    $ip = '10.77.0.1'
    foreach ($l in Get-Content (Join-Path $pasta 'config.bat')) { if ($l -match '^\s*set\s+"?IP_CABO=([^"]*)"?\s*$') { $ip = $Matches[1] } }

    $end = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $ip -ErrorAction SilentlyContinue
    if ($end) {
        $idx = $end.InterfaceIndex
        Remove-NetIPAddress -InterfaceIndex $idx -IPAddress $ip -Confirm:$false
        Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Enabled -AutomaticMetric Enabled
        Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses
        Set-DnsClient -InterfaceIndex $idx -RegisterThisConnectionsAddress $true
        Write-Host "Placa $($end.InterfaceAlias) voltou para IP automatico." -ForegroundColor Green
    } else {
        Write-Host "Nenhuma placa com o IP $ip."
    }

    Get-NetFirewallRule -Group 'AutoLaudoVet Desktop' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host 'Regra do firewall removida.' -ForegroundColor Green

    $atalhos = @(
        (Join-Path $usuario 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\AutoLaudoVet Desktop.lnk'),
        (Join-Path $usuario 'Desktop\AutoLaudoVet Desktop.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Desktop')) 'AutoLaudoVet Desktop.lnk')
    )
    foreach ($a in $atalhos) { if (Test-Path -LiteralPath $a) { Remove-Item -LiteralPath $a } }
    Write-Host 'Atalhos removidos. Os exames recebidos continuam na pasta Documentos\AutoLaudoVet\Exames.' -ForegroundColor Green
} catch {
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ''
Read-Host 'Pressione Enter para fechar' | Out-Null
