# Sistema Vetus

Recebe exames do ultrassom veterinário (Mindray Vetus) por DICOM, gera as fotos automaticamente e oferece uma área administrativa para o veterinário.

```
SistemaVetus/
├── receptor/        Receptor DICOM (Node.js): recebe, separa por formato e processa
├── web/             Área administrativa (Node.js + Express): exames, fotos, PDFs, medidas
├── tests/e2e.js     Teste ponta a ponta (simula o ultrassom e confere a área web)
├── docker-compose.yml
├── .env.example     Modelo de configuração (copie para .env)
└── .github/workflows/ci.yml   GitHub Actions: build dos containers + teste ponta a ponta
```

## Como os exames são organizados

Cada exame recebido vai para uma **pasta temporária**, com uma subpasta para cada formato que chegar:

```
dados/temp/<PACIENTE>_<DATA>_<EXAME>/        ex.: MAYA_20261106_ABD
├── exame.json          paciente, espécie, raça, sexo, idade, data, aparelho, totais
├── dicom-imagem/       imagens paradas (.dcm)
├── dicom-video/        clipes/vídeos (.dcm com vários quadros)
├── pdf/                relatórios PDF enviados pelo aparelho
├── sr/                 relatórios estruturados (.dcm) + medidas.json
├── dicom-outro/        qualquer outro objeto DICOM
└── fotosProcessadas/   fotos .jpg (imagem_001.jpg, video_004_quadro001.jpg, ...)
```

- O exame é processado quando o aparelho encerra o envio, ou após `IDLE_SECONDS` sem novos arquivos.
- As fotos são o JPEG original do aparelho, **sem recompressão** (mesma qualidade).
- Com `APAGAR_ORIGINAIS=true`, o `.dcm` de cada imagem, vídeo ou PDF é apagado depois de convertido. As subpastas que ficam vazias são removidas. O SR fica guardado junto do `medidas.json`.
- **Reenvio sem duplicar:** se o mesmo exame chegar de novo, ele usa a mesma pasta. As fotos, PDFs e medidas que já existem são **substituídos** e só o que falta é **acrescentado**. O terminal mostra quantas fotos são novas e quantas foram substituídas.
- Só se for **outro** exame (outro StudyInstanceUID) com o mesmo paciente, data e tipo, ele recebe o sufixo `_2`, `_3`…

### O arquivo `exame.json`

Criado no primeiro arquivo recebido e atualizado a cada processamento:

| Campo | Conteúdo |
|---|---|
| `paciente`, `especie`, `raca`, `sexo`, `idade`, `peso`, `nascimento` | dados do animal. `especie` costuma ser o preset do aparelho (ex.: `Caninos (5-15kg)`) |
| `responsavel` | tutor |
| `data`, `hora`, `descricao` | quando e qual exame (ex.: `ABD`) |
| `medicoSolicitante`, `operador`, `instituicao` | conforme configurado no aparelho |
| `fabricante`, `modelo`, `modalidade` | aparelho (ex.: Mindray Vetus E7, `US`) |
| `studyInstanceUID`, `exameId`, `accessionNumber` | identificadores do exame (usados para não duplicar) |
| `recebidoEm`, `processadoEm` | quando chegou e quando foi processado |
| `totais` | quantidade de fotos, PDFs e originais guardados |
| `arquivosPorSop` | controle interno: quais arquivos cada imagem DICOM gerou |

Campos vazios são os que o aparelho não preencheu (ex.: peso).

O terminal mostra cada etapa:

```
[RECEBENDO] Recebendo dados: MAYA_20261106_ABD
[RECEBENDO]   25 arquivos recebidos...
[RECEBIDO]  MAYA_20261106_ABD: 91 arquivo(s) (dicom-imagem: 80, dicom-video: 11)
[PROCESSANDO] MAYA_20261106_ABD: 91 arquivo(s)
[PRONTO]    Fotos convertidas e salvas em: .../MAYA_20261106_ABD/fotosProcessadas
```

## Os dois programas

| | Receptor (`receptor/`) | Área web (`web/`) |
|---|---|---|
| Conversa com | o **ultrassom** | as **pessoas** (navegador) |
| Protocolo | DICOM | HTTP |
| Porta | `2345` | `8080` |
| Faz | recebe os exames e gera as fotos | lista exames, fotos, PDFs e medidas (com login) |

Os dois usam a mesma pasta de dados: o receptor grava em `dados/temp/` e a área web lê de lá. Ficam separados para que o ultrassom continue conseguindo enviar mesmo se o site travar ou estiver sendo atualizado.

## Rodar sem Docker (Windows, na clínica)

Requer [Node.js](https://nodejs.org) 20 ou mais novo. Use **dois terminais**, um para cada programa, e deixe os dois abertos.

**Primeira vez apenas**, instale as dependências:

```powershell
cd C:\Git\SistemaVetus\receptor; npm install
cd C:\Git\SistemaVetus\web; npm install
```

**Terminal 1 – receptor DICOM:**

```powershell
cd C:\Git\SistemaVetus\receptor; npm start
```

**Terminal 2 – área web** (troque `sua-senha`):

```powershell
cd C:\Git\SistemaVetus\web; $env:ADMIN_USER='admin'; $env:ADMIN_PASSWORD='sua-senha'; $env:PORT='8080'; npm start
```

Abra `http://localhost:8080` neste PC, ou `http://<IP-deste-PC>:8080` em outro computador da rede, e entre com o usuário e a senha definidos acima.

- `$env:NOME='valor'` cria uma **variável de ambiente**. O programa lê esses valores ao iniciar (`process.env` no código), por isso a senha não fica escrita no código nem vai para o Git. Elas valem só para aquela janela do terminal: num terminal novo, rode o comando completo de novo.
- Sem `ADMIN_USER` e `ADMIN_PASSWORD` a área web se recusa a iniciar. Sem `PORT` ela usa a porta 3000.
- Os exames ficam em `C:\Git\SistemaVetus\dados\temp\` (fora do Git).
- Para parar um programa: **Ctrl+C** no terminal dele.
- Erro `listen EADDRINUSE ... :2345` (ou `:8080`): o programa **já está rodando** em outro terminal. Use o que está aberto, ou pare-o com Ctrl+C antes de iniciar de novo.

## Rodar com Docker (VPS ou Docker Desktop)

Os dois programas rodam em containers, sobem juntos e reiniciam sozinhos (inclusive quando o servidor reinicia).

```bash
cp .env.example .env              # no Windows: copy .env.example .env
# edite o .env: ADMIN_PASSWORD, ALLOWED_AES etc.
docker compose up -d --build      # sobe receptor + área web
docker compose logs -f receptor   # acompanhar os exames chegando (Ctrl+C sai do log, não para o container)
docker compose ps                 # ver se estão rodando e saudáveis
docker compose down               # parar (os exames são mantidos)
```

- Receptor DICOM: porta `DICOM_PORT` (padrão 2345). No ultrassom continua: IP do servidor, porta 2345, AE `MINIPACS`.
- Área web: `http://<servidor>:WEB_PORT` (padrão 8080), com `ADMIN_USER` / `ADMIN_PASSWORD` do `.env`.
- Os exames ficam no **volume Docker `vetus-dados`**, não na pasta `dados/`. Para copiar para fora: `docker compose cp receptor:/data/temp ./dados-docker`
- `docker compose down -v` **apaga o volume com todos os exames**.
- No Windows, o Docker Desktop precisa estar aberto. Pare o receptor sem Docker antes de subir os containers, para não haver conflito na porta 2345.

## Configurar o ultrassom (DICOM/HL7 → Definir serviço DICOM → Storage)

| Campo | Valor |
|---|---|
| Endereço IP | IP do servidor |
| Título AE | `MINIPACS` (ou o `AE_TITLE` do .env) |
| Porta | `2345` (ou `DICOM_PORT`) |
| Storage Commitment | desligado |

## Teste

Com o receptor e a área web rodando, na raiz do projeto:

```powershell
$env:WEB_URL='http://127.0.0.1:8080'; $env:ADMIN_USER='admin'; $env:ADMIN_PASSWORD='sua-senha'; node tests/e2e.js
```

O teste cria um exame de teste chamado `TESTE_CI` na pasta de dados.

O GitHub Actions roda em cada push: build das imagens, containers saudáveis e o teste ponta a ponta (3 imagens, 1 vídeo, 1 PDF e 1 SR → 6 fotos, 1 PDF, medidas e login na área web; depois o reenvio do mesmo exame, que deve substituir sem duplicar).

## Segurança e próximos passos

- Na internet, use **DICOM com TLS** (o Mindray tem porta TLS), firewall liberando só o IP da clínica e `ALLOWED_AES`.
- Coloque a área web atrás de HTTPS (proxy reverso, ex.: Caddy ou Nginx).
- Nunca versionar `dados/` nem `.env`: os exames têm dados de tutores (LGPD).
- Próximos passos: laudo com IA, banco de dados, contas de usuário e envio ao tutor.
