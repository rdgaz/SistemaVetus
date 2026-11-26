# Plano: recepção de exames pela nuvem (API de ingestão, receptor DICOM e apps de envio)

Proposta de 26/11/2026, **aprovada pelo usuário em 26/11/2026**. **Etapa 1 (API de ingestão) implementada na versão 0.10.32**; contrato em [API-INGESTAO.md](API-INGESTAO.md).
Substitui a parte "notebook → nuvem" de [PLANO-AGENTE-LOCAL.md](PLANO-AGENTE-LOCAL.md).

## 1. Objetivo

Uma única porta de entrada para os exames, **segura e estável**, usada por três tipos de cliente:

```
 Aparelhos com rede ─DICOM (TLS quando o aparelho tem)─┐
                                                       ▼
                                   ┌────────────────────────────┐
                                   │ Receptor DICOM na nuvem    │  repositório dgaz-vetus-receptor-dicom-claud
                                   └─────────────┬──────────────┘
                                                 │ HTTPS + token de serviço
 App Windows ─┐                                  ▼
 App Android ─┼── HTTPS + token do dispositivo ─▶ API de ingestão ──▶ armazenamento (disco → Backblaze)
              │                                  (plataforma .NET)     fila da IA, telas, laudos
 (recebem DICOM do aparelho local)                repositório SistemaVetus
```

- A **plataforma** é dona do armazenamento, da junção de exames, dos tokens e do registro de atividades.
- O **receptor** e os **apps** só recebem DICOM perto do aparelho e enviam pela API (sem disco compartilhado).
- O envio pelo pendrive (navegador, com login) continua como está.

## 2. Repositórios

| Repositório | Conteúdo | Publica |
|---|---|---|
| `SistemaVetus` (este) | API .NET, telas, banco, **API de ingestão** e o **contrato** `docs/API-INGESTAO.md` | Imagem `ghcr.io/rdgaz/vetus-plataforma` |
| `dgaz-vetus-receptor-dicom-claud` (novo) | Receptor DICOM na nuvem (vindo da pasta `receptor/`, com o histórico) | Imagem `ghcr.io/rdgaz/dgaz-vetus-receptor-dicom-claud` |
| `vetus-apps` (novo) | Apps de envio Windows e Android (.NET MAUI + fo-dicom), substituem o `autolaudovet.desktop/` | Instalador Windows e APK |

Cada repositório tem o seu `CLAUDE.md`/`AGENTS.md` e uma sessão própria no Claude. Mudança no contrato: a sessão da
plataforma atualiza `docs/API-INGESTAO.md` e sobe a versão do contrato; receptor e apps seguem o documento.

## 3. Autenticação: tokens por dispositivo

Hoje existe **um** token por clínica (`Clinica.TokenIngestaoHash`), sem uso. Passa a ser **um token por dispositivo**:

- Tabela nova `dispositivos_ingestao`: clínica, nome ("Notebook da Dra. Ana", "Receptor nuvem"), tipo (`windows`, `android`,
  `receptor`), hash SHA-256 do token (o token em si só aparece uma vez, na criação), criado por, criado em, último uso, IP do
  último uso, versão do app, ativo.
- **Tela da clínica** (aba nova em Configurações da clínica → "Aparelhos e apps"): o administrador cria um dispositivo, vê o
  código de pareamento e **revoga** quando quiser.
- **Pareamento sem digitar token**: o app mostra um campo "código de 8 caracteres"; a tela da clínica gera o código (vale 10 min);
  o app troca o código pelo token (`POST /api/ingestao/parear`). O token fica guardado no app (cofre do Windows / Keystore do
  Android).
- **Receptor na nuvem**: usa **um token de serviço do sistema** (não um por clínica) e informa o AE Title chamado e o AE de
  origem; a plataforma resolve a clínica pelo AE chamado e confere se o aparelho (AE de origem) está cadastrado nela (seção 6).
- Clínica vem **sempre** do token (ou do AE validado), nunca do que o cliente diz.

## 4. Fluxo de envio (retomável, sem duplicar)

Igual ao do pendrive, que já funciona, mas autenticado por token:

1. `POST /api/ingestao/exames` — abre (ou retoma) o envio de um exame. Corpo: identificação estável do exame
   (`idAnimal` + `subpasta` do aparelho, ou `studyInstanceUid` do DICOM), dados do paciente/responsável (do aparelho), lista
   de arquivos com nome, tamanho e SHA-1. Resposta: `envioId` e **quais arquivos faltam** (os que já chegaram, inclusive por
   outro caminho, não são pedidos de novo).
2. `PUT /api/ingestao/exames/{envioId}/arquivos/{nome}` — envia um arquivo (foto, PDF, `medidas.json`, vídeo). Confere o
   SHA-1 e o tamanho; pode repetir sem problema (idempotente).
3. `POST /api/ingestao/exames/{envioId}/concluir` — fecha: lê o PDF do aparelho, junta com um exame que já exista (mesmo
   `idAnimal`/UID, vindo do pendrive ou do DICOM), registra a atividade e coloca na fila da IA (se a clínica estiver em modo
   automático). Fotos e PDF primeiro; vídeos podem chegar depois (`concluir` aceita `videosDepois: true`).
4. `GET /api/ingestao/exames/{envioId}` — situação do envio (o app mostra "enviado", "na fila da IA", "laudo assinado").

Regras:
- **Só HTTPS**; token no cabeçalho `Authorization: Bearer`.
- Limites: 50 MB por foto/PDF, 500 MB por vídeo, 300 arquivos por exame, envios por minuto por dispositivo.
- Nomes de arquivo validados (sem `..`, `/`, `\`), extensões permitidas (`.jpg`, `.jpeg`, `.pdf`, `.mp4`, `.json`).
- Arquivo parcial nunca entra no exame: grava em pasta temporária e só move no `concluir`.
- Cada envio vira registro de atividade ("Exame enviado pelo app Notebook da Dra. Ana").
- Reaproveita do pendrive: leitura do PDF do aparelho (`RelatorioAparelho`), junção com o exame existente, fotos repetidas
  por SHA-1 (vão uma vez só).

## 5. Receptor DICOM na nuvem (`dgaz-vetus-receptor-dicom-claud`)

- Portas: **2762 com TLS** (certificado do domínio, renovado automaticamente) e **2345 sem TLS** (para aparelhos sem TLS,
  com as proteções da seção 6). A biblioteca DICOM atual precisa ser conferida quanto a TLS; se não tiver, um proxy TLS
  (stunnel ou HAProxy) fica na frente da porta 2762.
- Ao terminar um exame: extrai fotos, PDF e medidas (já faz) e envia pela API de ingestão (seção 4) em vez de gravar no
  volume compartilhado. Fila local com retentativa se a plataforma estiver fora.
- Sem dados permanentes: a pasta temporária é apagada depois do `concluir`.

## 6. Proteções do DICOM aberto na internet

- **AE Title difícil de adivinhar** para clínicas novas (ex.: `ALV7KQ2MZ9`, até 16 caracteres); as atuais podem trocar.
- **Cadastro do aparelho**: a clínica registra o AE de origem (e o número de série) de cada aparelho. Exame de origem
  desconhecida vai para **quarentena**: o administrador da clínica vê em "Aparelhos e apps" e aprova (o aparelho passa a ser
  conhecido) ou descarta.
- **Aviso** no sino do administrador do sistema para muitas tentativas recusadas ou origem nova.
- TLS sempre que o aparelho tiver; a tela de configuração do ultrassom mostra as duas opções (2762 com TLS, 2345 sem TLS).

## 7. Apps de envio (`vetus-apps`, Windows e Android)

- .NET MAUI + fo-dicom (recebe DICOM e aceita TLS); mesmo código para os dois sistemas.
- Recebe do aparelho local (cabo de rede direto, hotspot do notebook ou do celular), guarda numa **fila local** e envia pela
  API quando houver internet; retoma de onde parou.
- Tela simples: pareamento, situação da fila, últimos exames e a situação de cada um na nuvem.
- Windows substitui o AutoLaudoVet Desktop de hoje (scripts em `autolaudovet.desktop/`); Android vem depois.

## 8. Etapas

1. **API de ingestão** (plataforma): tabela de dispositivos, pareamento, os 4 endpoints, tela "Aparelhos e apps",
   `docs/API-INGESTAO.md` (contrato v1) e testes (`tests/ingestao.js` + itens no `tests/seguranca.js`).
2. **Imagens no GitHub (ghcr.io)** para a plataforma, e `docker-compose` de produção com `image:` (pré-requisito da VPS).
3. **Repositório `dgaz-vetus-receptor-dicom-claud`**: mover a pasta com o histórico, TLS, envio pela API, quarentena (seção 6).
4. **App Windows** (`vetus-apps`), substituindo o Desktop.
5. **App Android**.
6. **Backblaze e VPS** (armazenamento das fotos fora do servidor).

## 9. Verificação

- `tests/ingestao.js`: pareamento, envio completo, retomada (arquivo repetido), junção com exame do pendrive, arquivo com
  SHA-1 errado recusado, limite de tamanho, token revogado recusado, clínica certa pelo token, registro de atividade.
- `tests/seguranca.js`: ingestão sem token, token de outra clínica, nome de arquivo com `../`.
- Receptor e apps: testes nos próprios repositórios, contra uma plataforma de teste (`vetusteste`).

## Decisões do usuário (26/11/2026)

1. Plano aprovado: três repositórios (`SistemaVetus`, `dgaz-vetus-receptor-dicom-claud`, `vetus-apps`); o receptor ganha repositório próprio.
2. Apps em .NET MAUI (Windows e Android), pareamento por código, quarentena para aparelho desconhecido.
3. O receptor é trabalhado em **outra conversa (sessão do Claude)**, aberta na pasta do repositório `dgaz-vetus-receptor-dicom-claud`, seguindo
   o contrato `docs/API-INGESTAO.md` desta plataforma.
