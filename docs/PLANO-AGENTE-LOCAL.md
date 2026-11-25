# Plano: Agente local (ultrassom → PC da clínica → AutoLaudoVet online)

> Status (2026-11-24): **transferência aparelho → notebook feita** como **AutoLaudoVet Desktop** (cabo de rede direto + DICOM + painel local), em [autolaudovet.desktop/](../autolaudovet.desktop/LEIA-ME.md). O envio para a nuvem (API de ingestão abaixo) ainda não foi feito. Usa a seção 13 da especificação (API de ingestão), hoje desativada.

## 1. Ideia

```
 Ultrassom (Mindray Vetus)        PC da clínica (Windows)                  AutoLaudoVet online
 ┌───────────────────┐  DICOM   ┌───────────────────────────────┐  HTTPS  ┌──────────────────────────┐
 │ "Enviar" / Storage │ ───────▶ │ Agente AutoLaudoVet           │ ──────▶ │ /api/ingestao/...        │
 │ IP do PC:2345      │   rede   │  1. recebe o DICOM (C-STORE)  │  token  │  grava fotos/PDF/medidas │
 │ AE = ALV_C000N     │  local   │  2. extrai fotos, PDF, medidas│  do PC  │  cria ou junta o exame   │
 └───────────────────┘          │  3. fila de envio (retoma)    │         │  → fila da IA (seção 5)  │
                                 └───────────────────────────────┘         └──────────────────────────┘
```

## 1.1 Cenário principal: veterinário volante (Vetus + notebook + celular)

Ele não tem local próprio: atende em casas e clínicas diferentes, e a rede Wi-Fi muda a cada lugar (o IP também). A solução é **não depender da rede do lugar**: o aparelho fala só com o notebook, por uma ligação particular de **IP fixo**, e o notebook sobe para a nuvem por qualquer internet (Wi-Fi do lugar ou o celular roteando). Sair para a internet não precisa de IP fixo.

**Cabo USB direto do Vetus no notebook não funciona como "pendrive"**: as portas USB do aparelho são para pendrive, impressora e adaptador Wi-Fi, e as do notebook também. Os dois são o "lado chefe" do USB, então um cabo USB-USB não transfere nada. O cabo que funciona é o **cabo de rede**:

| Opção | Como liga | IP | O que comprar | Esforço do vet a cada exame |
|---|---|---|---|---|
| **A. Cabo de rede direto (recomendado)** | Cabo de rede do Vetus no notebook. Notebook sem porta de rede: **adaptador USB-Ethernet** (USB-C ou USB-A) | Fixo e sem roteador: Vetus `10.77.0.2`, notebook `10.77.0.1`. Configura uma vez | Cabo de rede + adaptador USB (cerca de R$ 50–80) | Liga o cabo e aperta "Enviar" no aparelho |
| **B. Wi-Fi do próprio notebook** | O notebook cria uma rede Wi-Fi ("Hotspot móvel" do Windows); o Vetus conecta nela, se o modelo tiver Wi-Fi | Fixo: o Windows sempre usa `192.168.137.1` | Nada (ou o adaptador Wi-Fi do aparelho, se for vendido à parte) | Nenhum cabo; o notebook precisa estar com o hotspot ligado |
| **C. Pendrive** (já existe) | Exporta no aparelho e espeta o pendrive no notebook | Não usa | Pendrive | O agente vê o pendrive e envia sozinho, sem abrir a tela de envio |

Nas opções A e B o aparelho é configurado **uma vez só** (servidor DICOM `10.77.0.1` ou `192.168.137.1`, porta 2345, AE da clínica) e nunca mais muda, em qualquer lugar. O instalador do agente configura o IP fixo do adaptador de rede (opção A) ou explica como ligar o hotspot (opção B).

> A confirmar no manual do modelo do Vetus: porta de rede (RJ45) e se ele aceita IP fixo sem gateway (nos Mindray isso é o normal), e se tem Wi-Fi para a opção B. Testar no aparelho real antes de prometer ao cliente.

**Pré-processamento no notebook (menos carga no servidor):**

- Extrair o JPEG dos `.dcm` (sem recompressão), o PDF e as medidas: o servidor não abre DICOM nenhum.
- **Fotos repetidas** (mesmo SHA-1) vão uma vez só; o servidor já faz isso para a IA, passa a ser feito antes do envio.
- Do vídeo, manda primeiro **o 1º quadro** (é o que a IA usa) e o `.mp4` depois, em segundo plano ou só se a clínica quiser guardar.
- Fotos e medidas vão antes; o exame já entra na fila da IA sem esperar os vídeos.
- O servidor só grava os arquivos e registra o exame.

**Por que um agente no PC, em vez de o aparelho mandar DICOM direto para a nuvem:**

- O DICOM do aparelho não tem criptografia: pela internet, os dados vão abertos. Do PC para a nuvem vai por **HTTPS**.
- Se a internet cair, o aparelho trava ou perde o envio. O agente **guarda o exame no PC** e manda depois.
- No aparelho, basta configurar um servidor na rede local (IP do PC). Não precisa abrir porta na nuvem para cada clínica nem mexer no aparelho se o servidor mudar de endereço.
- O envio direto pela internet continua funcionando para quem já usa (as duas formas convivem).

## 2. Decisões propostas (a confirmar)

| Ponto | Proposta | Alternativa |
|---|---|---|
| Onde processar | **No PC**: o agente reusa o `receptor/` (extrai JPEG sem recompressão, PDF, `medidas.json`) e manda só o que está pronto | Mandar os `.dcm` crus e processar na nuvem (mais tráfego e uma etapa a mais no servidor) |
| Tecnologia do agente | **Node.js**, o mesmo código do `receptor/` empacotado num `.exe` (Node SEA) e instalado como serviço do Windows | Reescrever em .NET com fo-dicom (refaz o que já funciona) |
| Autenticação | **Token por PC** ("dispositivo"), criado por um **código de pareamento** na tela Clínica; pode ser revogado | Token único da clínica (`TokenIngestaoHash`, já existe no banco) |
| Formato do envio | **Um arquivo por requisição**, igual ao pendrive (dá para retomar), e um "concluir" no fim | Um `.zip` por exame (simples, mas recomeça do zero se cair) |

## 3. API de ingestão (plataforma)

Base: `/api/ingestao`, só HTTPS, `Authorization: Bearer <token do dispositivo>`. Liga com `INGESTAO_HABILITADA=true`.

| Método e caminho | O que faz |
|---|---|
| `POST /pareamento` `{ codigo, nomePc }` | Troca o código de 8 dígitos (válido 15 min, gerado na tela Clínica) pelo token do dispositivo. O token só é mostrado uma vez. |
| `GET /status` | Valida o token; devolve clínica, AE Title esperado, limites e a versão mínima do agente. Também serve de "sinal de vida" (grava o último contato). |
| `POST /exames/verificar` `{ exames: [{ uid }] }` | Para cada exame: se já existe e quais arquivos já chegaram (nome + tamanho + SHA-256), para retomar sem reenviar. |
| `PUT /exames/{uid}/arquivos/{formato}/{nome}` | Um arquivo (`jpg`, `pdf`, `mp4`), com cabeçalho `X-Sha256`. Grava em `.parte` e só troca quando o hash confere. Reenviar o mesmo nome substitui. |
| `POST /exames/{uid}/concluir` `{ exame, medidas }` | Recebe o `exame.json` e as medidas; cria o exame ou **junta** com o mesmo exame vindo do pendrive/DICOM (mesma regra do `InternoEndpoints`). Entra na fila conforme o modo da clínica. |

Reaproveitar:

- A gravação de arquivos e os limites de `PendriveEndpoints` (25 MB foto, 500 MB vídeo, nomes validados).
- A criação/junção de exame e paciente de `InternoEndpoints` (`AcharOuCriarPaciente`, merge por ID do animal + data + hora). Extrair para um serviço comum (`RegistroExame`) usado pelos três caminhos: receptor, pendrive e ingestão.
- Arquivos ficam em `vetus-dados/<AE>/<exame>/recebido-jpg|recebido-pdf|...`, como a especificação já previa (seção 3).

Banco: nova entidade **Dispositivo** (clínica, nome do PC, hash do token, criado em, último contato, versão do agente, IP, revogado). Origem do exame: `agente`.

Segurança: limite de requisições por token, tamanho máximo por exame, token só em hash, revogação imediata, `uid` e nomes validados contra `..`.

## 4. Agente no PC

Base: o `receptor/` atual, separado em duas partes:

- **núcleo** (servidor DICOM + `processador.js` + `exames.js`): o mesmo código na nuvem e no PC;
- **saída**: na nuvem continua `plataforma.js` (API interna); no PC entra `envio.js` (API de ingestão).

O que o agente faz:

1. Recebe o DICOM do aparelho na rede local (porta 2345, AE da clínica), processa como hoje.
2. Coloca o exame numa **fila em disco** (`C:\ProgramData\AutoLaudoVet\fila\`), sobrevive a reinício do PC.
3. Envia: `verificar` → `PUT` de cada arquivo que falta → `concluir`. Sem internet, tenta de novo com espera crescente (30 s, 1 min, 5 min... até 30 min).
4. Depois de confirmado, apaga o local após **N dias** (padrão 7), para dar para reenviar se precisar.
5. **Página de status** em `http://localhost:2346`: conectado ou não, últimos exames, pendentes, erros, botão "reenviar". Ícone na bandeja do Windows (verde/amarelo/vermelho).
6. Opcional (fase 2): **vigiar o pendrive**. Ao conectar um pendrive com a estrutura do aparelho (`<NOME><ID>/<TIPO><AAAAMMDDHHMMSS>/`), oferece enviar, usando o mesmo fluxo.

Instalação:

- Instalador `.exe` (Inno Setup): serviço do Windows com início automático, regra no firewall **só para a rede local**, pergunta o código de pareamento.
- Atualização automática: o `GET /status` informa a versão mínima; o agente baixa o novo instalador do próprio AutoLaudoVet (com hash conferido).
- Na tela **Clínica**: "Conectar um PC" (gera o código), lista de PCs com último contato e "Desconectar". Aviso se o PC está sem contato há mais de 1 dia.
- Na **Ajuda**: passo a passo para configurar o aparelho (IP do PC, porta, AE Title) e IP fixo no PC.

## 5. Etapas

| # | Etapa | Pronto quando |
|---|---|---|
| 1 | Serviço comum `RegistroExame` (extraído de Interno + Pendrive) | Testes atuais (`tests/`) passam sem mudança |
| 2 | Entidade Dispositivo + pareamento + `GET /status` + tela "Conectar um PC" | Gera código na tela, troca por token, status responde |
| 3 | `verificar` / `PUT arquivos` / `concluir` | Teste em `tests/ingestao.js` envia um exame de exemplo, retoma no meio e junta com o mesmo exame do pendrive |
| 4 | Receptor separado em núcleo + saída; `envio.js` com fila em disco | `ferramentas/simular-ultrassom.js` → agente local → exame aparece na plataforma; derrubar a rede no meio e ver o envio retomar |
| 5 | Página de status + ícone na bandeja | Mostra pendentes e erros, "reenviar" funciona |
| 6 | Empacotar (.exe + serviço + instalador + atualização) | Instala num Windows limpo, sobrevive a reinício |
| 7 | Piloto numa clínica com o Vetus real, depois a Ajuda | Uma semana de exames sem perda |
| 8 | (Opcional) vigiar pendrive | Pendrive conectado → exames enviados |

Etapas 1–3 (plataforma) e 4–5 (agente) podem andar em paralelo depois que a API da etapa 3 estiver definida.

## 6. Perguntas em aberto

- Qual o **modelo exato do Vetus** (E7, Vetus 8, Vetus 9...)? Define se tem porta de rede e Wi-Fi (opções A e B).
- O notebook tem **porta de rede** ou só USB-C?
- O PC da clínica fica **ligado o dia todo**? Se não, o aparelho precisa reenviar (ou usar o pendrive) quando o PC estiver desligado.
- Os PCs são sempre **Windows**? (Mac/Linux mudam o empacotamento, não o código.)
- Uma clínica pode ter **mais de um aparelho/PC**? O plano já suporta vários dispositivos por clínica.
- Os **vídeos** vão sempre ou só sob demanda? São os arquivos grandes; dá para mandar fotos primeiro e vídeos depois.
