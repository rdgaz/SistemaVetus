# AutoLaudoVet

**Pré-laudos de ultrassom veterinário com IA** · um produto [Moderno Tech](https://modernotech.dev/)

Recebe exames do ultrassom veterinário (ex.: Mindray Vetus E7) por DICOM, gera as fotos, faz o pré-laudo com IA, e o veterinário revisa, assina e envia.

> O produto se chamava "Vetus" (nome que pertence a outra marca). Partes internas ainda usam o nome antigo: pasta do repositório, nomes dos containers (`vetus-*`), banco (`vetus`), variáveis `VETUS_*`. **AE Title das clínicas:** as novas recebem `ALV_C0002`, `ALV_C0003`...; as primeiras mantêm `VETUS_C0001` (já configurado no aparelho) e continuam funcionando.

**Marca:** logos e cores em `plataforma/front/public/marca/` (guia em `/marca/guia.html`). **Ajuda:** página `/ajuda` para os usuários das clínicas, com manual, WhatsApp do suporte da Moderno Tech e a versão. A versão (`plataforma/front/package.json`) aparece no rodapé com a data do build.

```
SistemaVetus/
├── receptor/        Receptor DICOM (Node.js): recebe, separa por formato e processa
├── plataforma/      Plataforma nova: API .NET 10 (api/) + telas React (front/) + PostgreSQL
├── web/             Área web antiga (protótipo): lista fotos, PDFs e medidas
├── tests/           e2e.js (ultrassom → fotos), plataforma.js (login, clínicas), exames.js (exames por clínica)
├── ferramentas/     simular-ultrassom.js: reenvia um exame já recebido como se fosse o aparelho
├── docs/            ESPECIFICACAO.md (o que o sistema faz) e COMANDOS-DOCKER.md (guia)
├── docker-compose.yml
├── .env.example     Modelo de configuração (copie para .env)
└── .github/workflows/ci.yml   GitHub Actions: build dos containers + testes
```

## Plataforma (clínicas, usuários e login)

A plataforma é o sistema novo descrito em [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md). Já tem os **passos 1 a 7**.

**Valores de referência (por espécie e porte)**

- Tabela de referências ultrassonográficas de cão e gato (rins, estômago, alças intestinais, adrenais, pâncreas, vesícula, baço, linfonodos, bexiga), cada uma com **faixa de peso** quando importa e a **fonte bibliográfica**. Os 27 valores iniciais vêm da literatura clássica (Nyland & Mattoon; Penninck & d'Anjou; Goggin 2000; Gladwin 2014; Mareschal 2007) e **devem ser validados por um veterinário ultrassonografista**.
- **Referências (sistema)**: o administrador cria, edita, desativa e apaga. "Termos" reconhecem a medida do aparelho (ex.: `rim comp` combina com "Rim E > Comprimento").
- Na tela do exame: **Medidas do aparelho × referência**, com a faixa e o destaque **▲ Acima / ▼ Abaixo** (converte cm/mm), e a lista das referências da espécie e do peso do paciente.
- A IA recebe as referências do paciente e as medidas já comparadas, e é instruída a citar quando uma medida está fora da faixa.

**Cobrança da IA (créditos das clínicas)**

- Cada clínica tem um **saldo em R$** de créditos para pré-laudos. Clínica nova recebe o **crédito inicial** (padrão R$ 40).
- Cada geração debita **custo real × fator**: custo real = tokens de entrada e saída × preço do modelo (US$ por milhão) × câmbio. Padrão: **fator 2** (100% de margem). Atualização sem fotos custa menos; **erro e "nada mudou" não cobram**.
- Sem saldo suficiente, o pré-laudo não é gerado (a tela pede recarga). Análise completa exige saldo de pelo menos um pré-laudo médio.
- A clínica vê o **saldo** e **≈ quantos pré-laudos ele rende** (média dos últimos 20 dela) na tela de Exames; o administrador da clínica vê o **extrato** em "Clínica". Cada pré-laudo mostra o valor cobrado.
- **Cobrança (sistema)**, para o administrador do sistema: fator, câmbio, crédito inicial, **preços dos modelos** (editáveis: os provedores mudam os preços), **seu saldo no provedor de IA** (o custo real de cada geração é descontado dele; aviso quando ficar abaixo do limite) e o resumo de custo × valor cobrado. Em **Clínicas (sistema)**, "+ Crédito" registra recargas (ou ajustes com valor negativo).
- Vende-se crédito para o **serviço de pré-laudo**, não acesso à API da IA. Emissão de nota fiscal e regras de validade/devolução de créditos devem ser vistas com um contador.

**Passo 7: envio do laudo**

- No laudo assinado, **Compartilhar** mostra só os canais que o usuário deixou ativos em **Minha conta → Envio de laudos**:
  - **WhatsApp**: abre o WhatsApp com a mensagem e o link do laudo (telefone do tutor já preenchido, se cadastrado). Não usa API: é o link `wa.me`, sem custo.
  - **E-mail**: envia o **PDF anexado** pelo **SMTP do próprio usuário** (o e-mail sai da conta dele). Atalhos para Gmail, Outlook, Yahoo e Hostinger; botão **Enviar teste**. Em Gmail/Outlook, use uma *senha de app*. A senha fica **criptografada** no banco e nunca volta pela API. Por segurança, servidores SMTP da rede interna são recusados.
  - **Copiar link** e **Baixar PDF**; no celular, **Enviar PDF** manda o próprio arquivo pela tela de compartilhar do aparelho.
- **Link público** (`/laudo/<código>`): página do tutor, sem login, com os dados do exame e o PDF da última versão assinada. Vale `LinkValidadeDias` (padrão 30, configurável por usuário), pode ser **revogado** e conta os acessos.
- **Histórico**: cada envio fica registrado (quem, quando, meio, destinatário).
- `VETUS_URL_PUBLICA` no `.env` é o endereço usado nos links e no QR code. Na rede local, use o IP do PC (ex.: `http://192.168.0.86:5080`); na nuvem, o domínio com HTTPS.

**Passo 6: revisão, assinatura e PDF**

- **Revisão** (exame em "Aguardando revisão"): cada órgão com Normal / Alterado / Não visualizado e o texto editável; **Normal** aplica a frase padrão de normalidade do órgão. Condições técnicas, impressão diagnóstica, diferenciais e recomendações (um por linha). **Prancha**: "Escolher fotos" (até 12; começa com as sugeridas pela IA). **Salvar revisão** e **Prévia do PDF** (marcada "RASCUNHO").
- **Aprovar e assinar**: veterinário ou administrador da clínica **com CRMV e UF** em "Minha conta"; exige nome, espécie, sexo, tutor e tipo de exame. Grava quem assinou, data/hora e um **código de verificação**. Depois disso o exame vira **Pronto** e não pode mais ser editado.
- **Retificação**: no laudo assinado, "Retificar" pede o motivo, marca a versão assinada como **retificada** e abre uma nova versão para revisar e assinar.
- **PDF** (QuestPDF): logo e dados da clínica, identificação do paciente, achados por órgão, impressão, diferenciais, recomendações, observação padrão, assinatura (imagem + nome + CRMV), prancha de fotos, e no rodapé o **código de verificação + QR code**.
- **Verificação pública** (`/verificar/<código>`, sem login, aberta pelo QR code): mostra se o laudo é autêntico, quem assinou e se foi retificado. `VETUS_URL_PUBLICA` no `.env` define o endereço usado no QR code.
- **Imagens**: assinatura em "Minha conta" e logo em "Clínica" (PNG/JPG até 500 KB).
- A biblioteca de PDF (QuestPDF) usa a licença gratuita *Community*, válida para empresas com faturamento anual abaixo de US$ 1 milhão.

**Passo 5: pré-laudo com IA**

- Uma **fila em segundo plano** pega os exames "Na fila" (urgentes primeiro, depois por ordem de entrada), marca "Gerando", chama a IA e deixa em **Aguardando revisão** (ou **Erro**, com o motivo). Gera até `IA_PARALELO` exames ao mesmo tempo. Se o sistema reiniciar no meio, o exame volta para a fila.
- A IA recebe: até `IA_MAX_IMAGENS` fotos (as imagens paradas e o 1º quadro de cada vídeo, **sem as fotos exatamente iguais**, que vão uma vez só; acima do limite, uma amostra espalhada), os dados do paciente, as medidas do aparelho, o campo livre e a lista de órgãos do abdômen conforme o sexo.
- Devolve, em JSON: condições técnicas, cada órgão (**normal / alterado / não visualizado** + descrição no padrão brasileiro), impressão diagnóstica, diferenciais, recomendações, fotos sugeridas para a prancha e alerta de achado urgente. Também organiza o campo livre nos campos vazios do exame (suspeita, histórico, jejum, castrado, peso, idade, solicitante).
- **Claude e Gemini:** `IA_ORDEM=claude,gemini` tenta o Claude e, se falhar (fora do ar, recusa, resposta inválida), o Gemini. Inverta para usar o Gemini como principal. O modelo de cada um é configurável (`CLAUDE_MODELO`, `GEMINI_MODELO`).
- **Configurar:** preencha no `.env` `ANTHROPIC_API_KEY` e/ou `GEMINI_API_KEY` (com `GEMINI_PROJETO` para o Vertex AI) e rode `docker compose up -d`. Sem nenhuma chave, os exames ficam na fila e a tela avisa.
- **Custo aproximado por exame** (15 fotos): Claude Opus 5.5 ~US$ 0,23; Sonnet 5.5 ~US$ 0,11; Haiku 5.5 ~US$ 0,01. O consumo de tokens de cada laudo fica gravado.
- **Atualizar sem reanalisar as fotos:** cada laudo guarda os dados usados e a impressão digital (SHA-1) de cada foto. Ao tocar em **Atualizar pré-laudo**, a IA recebe o pré-laudo anterior e **só o que mudou** (dados, texto livre, medidas), sem as fotos; se chegaram fotos novas ou substituídas, vão **só elas**. Se nada mudou, o sistema avisa e não chama a IA (sem custo). **Refazer análise completa** olha todas as fotos de novo. O modo de cada versão (completa / dados / imagens) aparece no pré-laudo.
- **Testes sem custo:** `IA_SIMULADA=true` gera um pré-laudo de exemplo sem chamar IA (é o que o GitHub Actions usa).

**Passo 4: tela do exame**

- **Fotos** numa faixa (ou "Ver todas" em grade); um toque abre em tela cheia.
- **Dados do paciente e do exame** (✎ Editar): paciente (nome, espécie, raça, sexo, castrado, idade, peso), tutor (nome, WhatsApp, e-mail) e exame (tipo, jejum, suspeita clínica, solicitante com CRMV, clínica solicitante, histórico). Corrige o que foi digitado errado no aparelho. O tipo vem sugerido do aparelho (`ABD` → abdominal).
- **Informações adicionais**: campo livre (escrever ou ditar pelo microfone do teclado) que a IA vai organizar e usar na análise.
- **Marcar urgente**: passa na frente na fila e aparece primeiro na lista.
- **Salvar** e **Gerar pré-laudo** (barra fixa embaixo no celular). Para gerar bastam **espécie** e **tipo de exame**; o resto aparece como "recomendado". O exame vai para **Na fila**; a geração pela IA é o próximo passo.
- Depois de assinado (Pronto), a tela fica só de leitura.

**Passo 2: exames por clínica**

- No ultrassom, cada clínica usa o **próprio AE Title** (`VETUS_C0001`...), mostrado na tela Exames enquanto não houver exames. O receptor pergunta à plataforma se o AE é de uma clínica ativa: se não for (ou se a clínica estiver bloqueada), **recusa a conexão**.
- Os arquivos vão para `temp/<AE da clínica>/<EXAME>/` (mesma organização de sempre: `dicom-*`, `jpg/`, `pdf/`).
- Quando o exame termina de chegar, o receptor avisa a plataforma, que cria o **exame**, o **paciente** e o **tutor** no banco. O exame entra como **Na fila** (clínica em modo automático) ou **Aguardando dados** (modo manual). Reenvio atualiza o mesmo exame.
- Se a plataforma estiver fora do ar, o exame não se perde: fica marcado como pendente no `exame.json` e é avisado de novo automaticamente.
- Tela **Exames**: abas por status, miniatura, paciente, tutor; ao abrir, dados, medidas, PDFs e as fotos (toque amplia; setas do teclado navegam).
- **AE antigo (`MINIPACS`)**: continua aceito. Com `AE_LEGADO_CLINICA=VETUS_C0001` no `.env`, os exames enviados a ele vão para essa clínica; vazio, ficam sem clínica (só na área web antiga).
- A comunicação receptor → plataforma usa a chave `VETUS_CHAVE_INTERNA` do `.env`.

**Simular o ultrassom** (reenvia um exame já recebido, com as fotos reais, sem o aparelho):

```powershell
node ferramentas/simular-ultrassom.js --exame dados\temp\MEG_20260901_ABD --ae VETUS_C0001
```

Opções: `--novo` (cria outro exame em vez de reenviar o mesmo), `--limite 5` (só as 5 primeiras imagens), `--host`, `--porta`, `--aparelho`. Cada foto volta a ser um DICOM com o mesmo JPEG (sem recompressão) e os dados do `exame.json`; os quadros de vídeo voltam a ser um clipe.

**Passo 1: clínicas, usuários e login**

- Login por e-mail e senha (cookie de sessão), troca de senha obrigatória no primeiro acesso.
- **Administrador do sistema:** cadastra clínicas. Cada clínica recebe um **AE Title** próprio (`VETUS_C0001`...), um token para a API de ingestão e o **administrador da clínica**, com senha provisória.
- **Administrador da clínica:** adiciona usuários (Usuário, Veterinário, Administrador), muda perfis, desativa; configura os dados da clínica e se o pré-laudo é **automático ou manual**.
- **Ultrassonografista volante:** o mesmo e-mail pode ter acesso a várias clínicas e escolhe a clínica no topo da tela.
- Cada usuário só vê as clínicas às quais tem acesso.
- API de ingestão (`POST /api/ingestao/exames`) **desativada**: responde 503 enquanto `INGESTAO_HABILITADA=false`.
- Telas para celular e computador.

**Acesso:** `http://localhost:5080`. O primeiro login é o administrador do sistema, com `VETUS_ADMIN_EMAIL` e `VETUS_ADMIN_SENHA` do `.env` (criado no primeiro início; depois, mudar o `.env` não altera a senha).

**Esqueceu a senha?** Redefina pelo servidor (a senha nova vai pela entrada do comando; mínimo de 8 caracteres; encerra as sessões abertas):

```powershell
'NovaSenhaAqui' | docker compose exec -T plataforma dotnet Vetus.Api.dll --redefinir-senha admin@vetus.local
```

**Desenvolvimento sem Docker** (requer .NET SDK 10 e Node 22+, e o PostgreSQL rodando, ex.: `docker compose up -d postgres` com a porta 5432 publicada):

```powershell
cd C:\Git\SistemaVetus\plataforma\api; $env:ConnectionStrings__Vetus='Host=localhost;Database=vetus;Username=vetus;Password=SENHA'; dotnet run --urls http://localhost:5080
cd C:\Git\SistemaVetus\plataforma\front; npm install; npm run dev
```

Mudou as tabelas (`plataforma/api/Dados`)? Crie a migração: `cd plataforma\api; dotnet tool restore; dotnet ef migrations add NomeDaMudanca -o Dados/Migracoes`. Ela é aplicada sozinha quando a plataforma inicia.

## Como os exames são organizados

Cada exame recebido vai para uma **pasta temporária**. Os originais recebidos (`.dcm`) ficam numa subpasta por **tipo** (`dicom-*`), e os arquivos extraídos deles numa subpasta com o **nome do formato** (`jpg/`, `pdf/`):

```
dados/temp/<PACIENTE>_<DATA>_<EXAME>/        ex.: MAYA_20261106_ABD
├── exame.json          paciente, espécie, raça, sexo, idade, data, aparelho, totais
├── medidas.json        medidas extraídas do relatório estruturado (SR)
├── dicom-imagem/       originais: imagens paradas (.dcm)
├── dicom-video/        originais: clipes/vídeos (.dcm com vários quadros)
├── dicom-pdf/          originais: PDF encapsulado (.dcm)
├── dicom-sr/           originais: relatórios estruturados (.dcm), sempre guardados
├── dicom-outro/        originais: qualquer outro objeto DICOM
├── jpg/                extraídos: fotos (imagem_001.jpg, video_004_quadro001.jpg, ...)
└── pdf/                extraídos: relatórios PDF
```

- O exame é processado quando o aparelho encerra o envio, ou após `IDLE_SECONDS` sem novos arquivos.
- O `.dcm` do Mindray é um "envelope" com os dados do exame e o **JPEG** de cada imagem (ou de cada quadro do vídeo). O receptor **extrai** esses JPEGs como estão, **sem recompressão** (mesma qualidade).
- Com `APAGAR_ORIGINAIS=true`, o `.dcm` de cada imagem, vídeo ou PDF é apagado depois de extraído. As subpastas que ficam vazias são removidas. O SR fica guardado em `dicom-sr/`.
- Exames recebidos com a organização antiga (`fotosProcessadas/`, `sr/`) são convertidos sozinhos para esta quando o receptor inicia.
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
[PRONTO]    Fotos extraídas e salvas em: .../MAYA_20261106_ABD/jpg
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

Os dois programas rodam em containers, sobem juntos e reiniciam sozinhos (inclusive quando o servidor reinicia). Cada comando está explicado em [docs/COMANDOS-DOCKER.md](docs/COMANDOS-DOCKER.md).

```bash
cp .env.example .env              # no Windows: copy .env.example .env
# edite o .env: ADMIN_PASSWORD, ALLOWED_AES etc.
docker compose up -d --build      # sobe receptor + área web
docker compose logs -f receptor   # acompanhar os exames chegando (Ctrl+C sai do log, não para o container)
docker compose ps                 # ver se estão rodando e saudáveis
docker compose down               # parar (os exames são mantidos)
```

| Container | Porta | O que é |
|---|---|---|
| `vetus-receptor` | `2345` | Receptor DICOM. No ultrassom: IP do servidor, porta 2345, AE da clínica (`VETUS_C0001`...) |
| `vetus-plataforma` | `5080` | Plataforma nova (`http://localhost:5080`) |
| `vetus-postgres` | — | Banco de dados (só acessível pelos containers) |
| `vetus-web` | `8080` | Área web antiga, com `ADMIN_USER` / `ADMIN_PASSWORD` do `.env` |

- Os exames ficam no **volume `vetus-dados`**, o banco no **`vetus-banco`** e as chaves de login no **`vetus-chaves`**, não na pasta `dados/`. Para copiar os exames para fora: `docker compose cp receptor:/data/temp ./dados-docker`
- `docker compose down -v` **apaga os volumes: todos os exames e o banco**.
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

Teste da plataforma (login, clínicas, usuários, permissões); cria clínicas e usuários de teste no banco:

```powershell
$env:VETUS_ADMIN_EMAIL='admin@vetus.local'; $env:VETUS_ADMIN_SENHA='senha-do-.env'; node tests/plataforma.js
```

Teste dos exames por clínica (envia DICOM ao AE de clínicas de teste e confere a plataforma; mesmas variáveis): `node tests/exames.js`.

Os testes da plataforma criam clínicas chamadas `Clínica A/B/X/Y <número>` e usuários `@teste.local` no banco.

O GitHub Actions roda em cada push: build das imagens, containers saudáveis, o teste ponta a ponta (3 imagens, 1 vídeo, 1 PDF e 1 SR → 6 fotos, 1 PDF, medidas e login na área web; depois o reenvio do mesmo exame, que deve substituir sem duplicar) e o teste da plataforma.

## Segurança e próximos passos

- Na internet, use **DICOM com TLS** (o Mindray tem porta TLS), firewall liberando só o IP da clínica e `ALLOWED_AES`.
- Coloque a área web atrás de HTTPS (proxy reverso, ex.: Caddy ou Nginx).
- Nunca versionar `dados/` nem `.env`: os exames têm dados de tutores (LGPD).
- Próximos passos: laudo com IA, banco de dados, contas de usuário e envio ao tutor.
