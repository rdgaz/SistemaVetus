# AutoLaudoVet Desktop

Recebe os exames do ultrassom (Mindray Vetus) no notebook por um **cabo de rede ligado direto** no aparelho, sem roteador e sem depender do Wi-Fi do lugar. O aparelho envia por **DICOM** (o mesmo "Enviar"/Storage de sempre). O notebook guarda fotos, PDF e medidas numa pasta e mostra tudo num painel.

> Por enquanto só recebe no notebook. O envio automático para o AutoLaudoVet online vem numa próxima versão, usando os mesmos exames e a mesma configuração do aparelho.

## Como funciona

```
Ultrassom  ──cabo de rede──▶  Notebook (10.77.0.1)
10.77.0.2     DICOM, porta 2345     AutoLaudoVet Desktop → Documentos\AutoLaudoVet\Exames
                                    Painel: http://127.0.0.1:23460
Wi-Fi do notebook: continua normal (internet), não é alterado.
```

- O IP fixo fica **só na placa com fio**. O Wi-Fi continua automático.
- A placa com fio **não tem gateway**: o Windows só usa o cabo para falar com o `10.77.0.x` (o ultrassom). Todo o resto, inclusive a internet, sai pelo Wi-Fi ou pelo celular.
- O firewall só deixa entrar na porta 2345 quem vem do cabo (`10.77.0.0/24`).

## O que precisa

- **Cabo de rede** comum (RJ45). Qualquer um serve, sem ser "crossover": as placas atuais se ajustam sozinhas.
- Notebook sem porta de rede: **adaptador USB-Ethernet** (USB-C ou USB-A).
- Windows 10 ou 11.

## Instalação no notebook (uma vez)

1. Copie a pasta `autolaudovet.desktop` para `C:\AutoLaudoVet` (ou outro lugar fixo; não use a área de trabalho nem o Downloads).
2. Abra `config.bat` no Bloco de Notas e troque o `AE_TITLE` pelo AE da clínica (ex.: `ALV_C0002`).
3. Ligue o adaptador USB-Ethernet (se precisar).
4. Clique com o botão direito em `configurar-cabo.ps1` → **Executar com o PowerShell** e aceite a permissão de administrador. Se houver mais de uma placa com fio, escolha a do cabo do ultrassom.
5. O painel abre no navegador. O ícone **AutoLaudoVet Desktop** fica na área de trabalho, e o programa passa a iniciar com o Windows.

## Configuração no ultrassom (uma vez)

No menu de configuração do Vetus (Rede / DICOM; os nomes mudam um pouco conforme o modelo):

| Onde | Valor |
|---|---|
| Rede local do aparelho: IP | `10.77.0.2` |
| Máscara | `255.255.255.0` |
| Gateway | em branco |
| DICOM Storage: servidor (IP) | `10.77.0.1` |
| Porta | `2345` |
| AE Title do servidor | o AE da clínica (o mesmo do `config.bat`) |

Use **Verificar** (Verify/Echo) no aparelho: o painel mostra "Teste OK". Depois é só usar o **Enviar** do exame normalmente.

## Dia a dia

1. Ligue o cabo no aparelho e no notebook.
2. Envie o exame no aparelho.
3. Ele aparece no painel e na pasta `Documentos\AutoLaudoVet\Exames\<AE>\<PACIENTE_DATA_EXAME>\`:
   - `jpg\`: fotos e quadros dos vídeos (o mesmo JPEG do aparelho, sem perder qualidade);
   - `pdf\`: relatório do aparelho;
   - `medidas.json`: medidas;
   - `exame.json`: dados do paciente e do exame.

Reenviar o mesmo exame completa a mesma pasta, sem duplicar.

## Problemas comuns

| Painel mostra | O que fazer |
|---|---|
| Cabo desligado ou não configurado | Confira o cabo/adaptador. Se trocou de adaptador, rode `configurar-cabo.ps1` de novo. |
| Sem contato ainda | No aparelho, confira IP `10.77.0.2`, servidor `10.77.0.1`, porta `2345`. |
| Conexão recusada | O AE Title no aparelho está diferente do `config.bat`. |
| Receptor parado | Abra o ícone **AutoLaudoVet Desktop** de novo. Detalhes em `logs\receptor.log`. |

Para desfazer tudo (placa volta para IP automático, firewall e atalhos removidos): `desfazer-cabo.ps1`. Os exames ficam na pasta.

## Para quem desenvolve

- O receptor é o mesmo do servidor (`receptor/src`), rodando sem a plataforma (`PLATAFORMA_URL` vazio), com `EXAMES_DIR`, `PAINEL_PORTA` e `IP_CABO`.
- Montar o pacote (com `node.exe`): `node ferramentas/empacotar-desktop.js` → `dist/autolaudovet.desktop/` e `dist/autolaudovet.desktop.zip`.
- Teste: `node tests/desktop.js`.
