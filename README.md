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

O terminal mostra cada etapa:

```
[RECEBENDO] Recebendo dados: MAYA_20261106_ABD
[RECEBENDO]   25 arquivos recebidos...
[RECEBIDO]  MAYA_20261106_ABD: 91 arquivo(s) (dicom-imagem: 80, dicom-video: 11)
[PROCESSANDO] MAYA_20261106_ABD: 91 arquivo(s)
[PRONTO]    Fotos convertidas e salvas em: .../MAYA_20261106_ABD/fotosProcessadas
```

## Rodar com Docker (VPS)

```bash
cp .env.example .env      # ajuste ADMIN_PASSWORD, ALLOWED_AES etc.
docker compose up -d --build
docker compose logs -f receptor   # acompanhar os exames chegando
```

- Receptor DICOM: porta `DICOM_PORT` (padrão 2345)
- Área administrativa: `http://<servidor>:WEB_PORT` (padrão 8080), com login `ADMIN_USER` / `ADMIN_PASSWORD`
- Os dados ficam no volume Docker `vetus-dados`

## Rodar sem Docker (Windows, na clínica)

```powershell
cd receptor; npm install; npm start        # terminal 1
cd web; npm install; $env:ADMIN_USER='admin'; $env:ADMIN_PASSWORD='senha'; npm start   # terminal 2
```

Os dados ficam em `dados/` na raiz do projeto (fora do Git).

## Configurar o ultrassom (DICOM/HL7 → Definir serviço DICOM → Storage)

| Campo | Valor |
|---|---|
| Endereço IP | IP do servidor |
| Título AE | `MINIPACS` (ou o `AE_TITLE` do .env) |
| Porta | `2345` (ou `DICOM_PORT`) |
| Storage Commitment | desligado |

## Teste

```bash
node tests/e2e.js     # com receptor e web rodando; variáveis: DICOM_PORT, WEB_URL, ADMIN_USER, ADMIN_PASSWORD
```

O GitHub Actions roda em cada push: build das imagens, containers saudáveis e o teste ponta a ponta (3 imagens, 1 vídeo, 1 PDF e 1 SR → 6 fotos, 1 PDF, medidas e login na área web).

## Segurança e próximos passos

- Na internet, use **DICOM com TLS** (o Mindray tem porta TLS), firewall liberando só o IP da clínica e `ALLOWED_AES`.
- Coloque a área web atrás de HTTPS (proxy reverso, ex.: Caddy ou Nginx).
- Nunca versionar `dados/` nem `.env`: os exames têm dados de tutores (LGPD).
- Próximos passos: laudo com IA, banco de dados, contas de usuário e envio ao tutor.
