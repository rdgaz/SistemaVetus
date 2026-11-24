# AutoLaudoVet: especificação do sistema

> Antigo nome de trabalho: Vetus. Produto da Moderno Tech.

Plataforma para clínicas veterinárias e ultrassonografistas: recebe os exames de ultrassom, gera o pré-laudo com IA numa fila e o veterinário revisa, assina e envia. Funciona no **celular e no computador**.

> Documento vivo: as decisões marcadas como **(a confirmar)** ainda podem mudar.

## 1. Arquitetura

Uma **nuvem única** atende todas as clínicas. Tudo roda em containers Docker no mesmo servidor.

- **Agora:** roda **localmente** (Docker Desktop neste PC) para testes, com o mesmo `docker-compose`.
- **Depois:** o provedor da nuvem ainda será escolhido. Como tudo está em Docker, a mudança é reinstalar o compose no servidor e apontar os ultrassons para o novo endereço.

```
Clínica A: ultrassom ──DICOM──┐
Clínica B: ultrassom ──DICOM──┤
                              ▼
┌──────────────────────── Servidor (Docker) ────────────────────┐
│  receptor-dicom  ── recebe, extrai as fotos, identifica a     │
│                     clínica e registra o exame                │
│  api             ── cadastros, login, exames, fila, laudos    │
│    └ /api/ingestao  (DESATIVADO por enquanto: ver seção 13)   │
│  worker-laudos   ── consome a fila e chama a IA               │
│  web             ── telas (React, responsivas)                │
│  postgres        ── banco de dados                            │
│  proxy           ── domínio e HTTPS (na nuvem)                │
└───────────────────────────────────────────────────────────────┘
              │ fotos                     │ IA
              ▼                           ▼
   armazenamento (disco / R2)     Claude (principal), Gemini (reserva)
```

- Os dados dos exames **não têm informações sensíveis** no sentido da LGPD. O nome do responsável, telefone e e-mail ainda são **dados pessoais**: acesso só com login, termo de uso e privacidade, exclusão a pedido.
- Tecnologia **(a confirmar)**: API e worker em **.NET** + **PostgreSQL** + telas em **React/TypeScript**. O receptor DICOM atual (Node) é reaproveitado e passa a registrar os exames no banco.

## 2. Clínicas, profissionais e acessos

### Ultrassonografista volante
No Brasil, muitos ultrassonografistas **atendem várias clínicas**. Por isso o acesso é por **vínculo**: um usuário pode estar ligado a **várias clínicas**, com um perfil em cada uma.

- Ao entrar, o usuário escolhe a clínica (ou vê "Todas as minhas clínicas" na lista de exames).
- O laudo distingue **quem fez o exame** (ultrassonografista, com CRMV e UF) de **quem pediu** (clínica e veterinário solicitante, com CRMV).

### Perfis
| Perfil | Pode |
|---|---|
| **Administrador do sistema** | Cadastrar, ativar e bloquear clínicas; ver consumo de IA por clínica |
| **Administrador da clínica** | Convidar e desativar usuários da clínica; configurações da clínica; modelos de laudo |
| **Veterinário** (com CRMV) | Ver e editar exames; gerar pré-laudo; **aprovar e assinar** laudos; compartilhar |
| **Usuário** | Ver exames; preencher dados e informações adicionais; gerar pré-laudo; compartilhar laudos prontos. **Não assina.** |

- Cada clínica tem **pelo menos um administrador** e pode ter vários usuários.
- Todo usuário vê **somente os dados das clínicas às quais está vinculado** (todas as tabelas têm `ClinicaId`).
- Somente quem tem perfil Veterinário e **CRMV cadastrado** assina **(a confirmar)**.

### Identidade do laudo
O cabeçalho do PDF (logo, nome, endereço, contato) pode ser:
- da **clínica** (padrão), ou
- do **ultrassonografista**, quando ele laudar com a própria marca.

A escolha fica nas configurações do vínculo do ultrassonografista com a clínica.

## 3. Identificação da clínica no DICOM

Todas as clínicas enviam para o mesmo servidor e a mesma porta.

- Cada clínica recebe um **AE Title próprio do servidor** (ex.: `VETUS_C0001`), gerado no cadastro.
- No ultrassom, a clínica configura: endereço do servidor, porta `2345` e **o AE Title dela**.
- O receptor aceita só AE Titles cadastrados e ativos; os demais são rejeitados e registrados no log.
- Opcional por clínica: restringir também pelo AE do aparelho (*calling AE*) e/ou pelo IP de origem.
- O ultrassonografista volante que leva o próprio aparelho pode ter um **AE Title por clínica** no aparelho, ou um AE próprio e escolher a clínica do exame na tela.

### Organização dos arquivos de cada exame

Uma pasta por clínica e, dentro, uma pasta por exame (como hoje). Os **originais recebidos** ficam numa subpasta por **tipo**; os **arquivos extraídos** deles, numa subpasta com o **nome do formato**:

```
<dados>/<AE da clínica>/<PACIENTE>_<DATA>_<EXAME>/
├── exame.json        dados do exame
├── medidas.json      medidas extraídas do SR
├── dicom-imagem/     originais .dcm (imagens)        ┐
├── dicom-video/      originais .dcm (clipes)         │ recebidos do
├── dicom-pdf/        originais .dcm (PDF)            │ ultrassom
├── dicom-sr/         originais .dcm (medidas)        │
├── dicom-outro/      outros objetos DICOM            ┘
├── recebido-jpg/     fotos que chegaram prontas (ingestão / upload, futuro)
├── jpg/              fotos extraídas dos .dcm        ┐ gerados pelo
└── pdf/              PDFs extraídos dos .dcm         ┘ sistema
```

- O `.dcm` do Mindray é um "envelope" com os dados do exame e o JPEG de cada imagem; o receptor **extrai** o JPEG como está, sem recompressão.
- Só o sistema grava em `jpg/` e `pdf/`. O que chega pronto de fora fica em `recebido-<formato>/` e nunca sobrescreve um arquivo extraído.
- Reenvio do mesmo exame substitui os arquivos dele e acrescenta só o que falta, sem duplicar.

## 4. Paciente e responsável

O ultrassom só manda os dados digitados pelo operador, muitas vezes com erros.

- Cada exame é **vinculado a um paciente** da clínica. Ao chegar, o sistema sugere o paciente existente (mesmo nome + responsável + espécie); se não houver, cria um novo.
- Os dados do paciente podem ser **corrigidos** na tela do exame, e dois cadastros duplicados podem ser **unificados**.
- **Paciente:** nome, espécie, raça, sexo, **castrado**, data de nascimento ou idade, peso (o peso é por exame).
- **Responsável:** nome, telefone (WhatsApp), e-mail.
- Na tela do exame aparece o **histórico de exames do mesmo animal**, com acesso aos laudos anteriores. A IA recebe a conclusão do último laudo para comparar ("redução da lesão em relação ao exame de 10/08").

## 5. Ciclo de vida do exame

### Análise automática ou manual
Configuração da clínica: **"Gerar pré-laudo automaticamente ao receber"** (ligado/desligado). Dá para mudar exame a exame.

- **Automático:** o exame entra na fila assim que termina de chegar. Se depois alguém acrescentar informações, pode **gerar de novo**.
- **Manual:** o exame espera em **"Aguardando dados"** até alguém preencher o que quiser e tocar em **Gerar pré-laudo**.

### Status
```
                 (manual)
Recebido ──> Aguardando dados ──┐
    │ (automático)              ▼
    └──────────────────────> Na fila ──> Gerando ──> Aguardando revisão ──> Pronto (assinado)
                                            └──> Erro (tentar de novo)         │
                                                                               └──> Retificado (nova versão)
```

| Status | Significado |
|---|---|
| **Aguardando dados** | Modo manual: esperando alguém completar os dados e pedir a geração |
| **Na fila** | Esperando a vez |
| **Gerando** | IA analisando as imagens |
| **Aguardando revisão** | Pré-laudo pronto, esperando o veterinário |
| **Pronto** | Aprovado e assinado; pode ser compartilhado |
| **Erro** | Falha nas duas IAs; botão "Tentar novamente" |

### Fila
- **Ordem de chegada** (quando o exame entrou na fila), única para todas as clínicas.
- Exames marcados como **Urgente** passam na frente (ex.: A-FAST/T-FAST, suspeita de piometra, corpo estranho, torção).
- Processa **N exames em paralelo** (configurável, início: 2) para respeitar os limites das APIs.
- Se o servidor reiniciar, exames em "Gerando" voltam para "Na fila".
- Cada tentativa fica registrada: IA usada, tempo, tokens, custo estimado, erro.

## 6. Informações para a IA (campo livre)

Um único campo de texto, **bem simples**, na tela do exame:

> **Informações adicionais** *(opcional)*
> "Escreva ou dite o que souber: suspeita, histórico, o que o responsável relatou, observações do exame..."

- Aceita qualquer texto. No celular, o **microfone do teclado** permite ditar.
- Exemplos: *"Lulu, 9 anos, castrada, vômito há 3 dias, sem jejum, muito agitada. Suspeita de corpo estranho. Solicitante Dra. Ana CRMV-SP 12345."*
- A IA usa esse texto de duas formas:
  1. **Organiza** o que reconhecer nos campos estruturados (suspeita clínica, histórico, castrado, jejum, peso, solicitante, limitações técnicas). O usuário vê o que foi preenchido e pode corrigir.
  2. **Considera** o texto na análise das imagens e na redação do laudo.
- O texto original fica guardado junto do exame.

## 7. Dados obrigatórios

Podem ser preenchidos **à mão** ou deixados para a IA extrair do campo livre.

| Momento | Obrigatório |
|---|---|
| Para **gerar** o pré-laudo | Espécie e tipo de exame (definem os valores de referência e o modelo) |
| Para **assinar** o laudo | Nome do paciente, espécie, sexo, responsável, tipo de exame, ultrassonografista com CRMV |

Campos recomendados (o sistema avisa se faltarem, mas não bloqueia): raça, idade, peso, castrado, suspeita clínica, solicitante, jejum.

## 8. Geração do laudo com IA

- **Claude** como principal e **Gemini** como reserva, usado se o principal falhar **(a confirmar)**.
- **Entrada da IA:**
  - as **imagens-chave** do exame (as que têm medidas e anotações, até um limite configurável);
  - as **medidas** extraídas do SR do aparelho;
  - dados do paciente e campos estruturados;
  - o **campo livre** de informações adicionais;
  - os **valores de referência** da espécie e do porte (seção 10);
  - o **modelo de laudo** do tipo de exame (seção 9);
  - a conclusão do **laudo anterior** do mesmo animal, se houver.
- **Saída em formato estruturado** (JSON por seção), convertida no texto do laudo:
  - campos extraídos do texto livre;
  - achados **por órgão**, cada um com um indicador "normal / alterado / não visibilizado";
  - **condições técnicas e limitações**;
  - **impressão diagnóstica**, diagnósticos diferenciais e recomendações;
  - sugestão das **imagens para a prancha**;
  - sinal de **achado urgente** (para alertar a clínica).
- **Regras para a IA:** nunca descrever achados de órgão que não aparece nas imagens (marcar como "não visibilizado" e dizer o motivo); usar a terminologia da seção 9.
- O pré-laudo fica sempre em **"Aguardando revisão"**; nunca é liberado sem aprovação humana.
- Fica guardada a **diferença entre o texto da IA e o texto aprovado**, para melhorar os modelos e os prompts com o tempo.

## 9. Modelo do laudo (padrão brasileiro)

Estrutura usual dos laudos ultrassonográficos veterinários no Brasil. Deve ser validada por um veterinário ultrassonografista antes do uso com clientes.

1. **Cabeçalho:** identidade do laudo (clínica ou ultrassonografista: seção 2).
2. **Identificação:** paciente (nome, espécie, raça, sexo, castrado, idade, peso), responsável, clínica e veterinário solicitante (com CRMV), data do exame.
3. **Exame:** tipo (ex.: ultrassonografia abdominal), equipamento, **suspeita clínica**.
4. **Condições técnicas:** jejum, repleção vesical, gases, obesidade, agitação, sedação. Lista dos **órgãos não visibilizados** e o motivo.
5. **Achados por órgão**, sempre com os mesmos critérios: **dimensões, contornos, margens, ecogenicidade, ecotextura, arquitetura**, e os específicos de cada órgão:

| Órgão | Critérios específicos |
|---|---|
| Fígado | dimensões (relação com o arco costal), vasculatura |
| Vesícula biliar | parede, conteúdo (lama biliar, mucocele, cálculos), ductos |
| Baço | dimensões, nódulos |
| Rins | comprimento, **relação corticomedular**, pelve, cálculos |
| Bexiga | **repleção**, parede, conteúdo (sedimento, cálculos) |
| Estômago | espessura e estratificação da parede, conteúdo, peristaltismo |
| Alças intestinais | espessura e **estratificação das camadas parietais**, peristaltismo, conteúdo |
| Pâncreas | dimensões, ecogenicidade, ducto pancreático, mesentério adjacente |
| Adrenais | espessura do polo caudal (conforme o peso), forma |
| Linfonodos | **jejunais, ilíacos mediais** e outros visualizados |
| Reprodutivo | útero e ovários / próstata e testículos (conforme o sexo e a castração) |
| Cavidade | líquido livre, gás livre, mesentério |

6. **Impressão diagnóstica:** com os termos usuais **"compatível com"**, **"sugestivo de"**, **"não se descarta"**, e diagnósticos diferenciais quando couber.
7. **Recomendações:** correlacionar com os dados clínicos e laboratoriais, repetir o exame em X dias, citologia ou biópsia guiada etc.
8. **Observação:** "O exame ultrassonográfico deve ser interpretado em conjunto com os dados clínicos e outros exames complementares."
9. **Prancha de imagens** (seção 11).
10. **Assinatura:** nome, **CRMV/UF** do ultrassonografista, data e hora da aprovação, código de verificação (seção 12).

### Máscaras de normalidade
Cada modelo tem uma **frase de normalidade por órgão** ("Rim esquerdo com dimensões preservadas, contornos regulares, relação corticomedular preservada..."). Na revisão, um toque em **"Normal"** aplica a frase do órgão. A clínica e o ultrassonografista podem ajustar as próprias máscaras.

### Tipos de exame
1ª versão: **ultrassonografia abdominal** (cão e gato). Os demais tipos (gestacional, cervical, ocular, musculoesquelético, torácico, A-FAST/T-FAST) entram como novos modelos depois, sem mudar o sistema.

## 10. Valores de referência

- Tabela de **valores de referência por espécie e porte (peso)**: ex.: comprimento renal (gato), razão rim/aorta (cão), espessura das paredes gástrica e intestinal, adrenais conforme o peso, ducto pancreático, próstata.
- Na revisão, as medidas aparecem **ao lado da faixa de referência**, com destaque quando estão fora.
- A IA recebe a mesma tabela.
- Tabela editável pelo administrador do sistema; a clínica pode ter ajustes próprios. Cada valor guarda a **fonte bibliográfica**.

## 11. Prancha de imagens

- O PDF traz uma **prancha com as imagens selecionadas** (de 4 a 12; padrão 6).
- A IA sugere as imagens; na revisão, cada foto tem uma marcação **"No laudo"** para incluir ou tirar.

## 12. Assinatura, imutabilidade e retificação

- **Aprovar e assinar** grava: nome, CRMV/UF, data e hora. O PDF leva a **imagem da assinatura** cadastrada pelo veterinário.
- Depois de assinado, o laudo **não pode ser editado**. Uma correção é uma **retificação**: gera uma **nova versão** com o motivo; a versão anterior fica guardada e marcada como "retificada".
- Cada PDF tem um **código de verificação** e um **QR code**, que abrem uma página pública mostrando se o laudo é autêntico e qual é a versão vigente.
- Futuro: **assinatura digital** (ICP-Brasil / gov.br).
- O telediagnóstico (laudar à distância) é regulamentado pelo CFMV (até onde sabemos, Resolução CFMV nº 1.465/2022): **conferir o texto vigente** sobre identificação e responsabilidade antes do uso comercial.

## 13. API de ingestão (servidores locais) — DESATIVADA

Para o futuro: clínicas com servidor local processam os exames lá e enviam os dados prontos (fotos + `exame.json` + medidas).

- Endpoint reservado: `POST /api/ingestao/exames`.
- Autenticação por **token da clínica** (gerado no cadastro).
- Por enquanto **desativado**: configuração `INGESTAO_HABILITADA=false`; quando desativado, responde `503` com a mensagem "ingestão ainda não disponível".
- Quando ativado, o exame entra no mesmo fluxo (seção 5).

## 14. Compartilhar o laudo

Quando o laudo está **Pronto**, o botão **Compartilhar** abre as opções:

| Opção | Como funciona |
|---|---|
| **WhatsApp** | Abre o WhatsApp com a mensagem pronta: "Olá! O laudo do exame de *Lulu* está disponível: *link*". O número do responsável ou do solicitante vem preenchido, se cadastrado. No **celular**, também dá para enviar o **próprio PDF** pela tela de compartilhamento do aparelho. |
| **E-mail** | O sistema envia o e-mail com o **PDF anexado** e o link, para o responsável e/ou o solicitante (endereços editáveis antes de enviar). |
| **Baixar PDF** | Baixa o arquivo. |
| **Copiar link** | Copia o link público do laudo. |

- O **link público** abre o laudo sem login, por um código aleatório. Pode ter **validade** e ser **revogado**.
- Cada envio fica registrado (quem, quando, por qual meio, para quem).

## 15. Telas (celular e computador)

Uma única aplicação web **responsiva**, que pode ser **instalada como app** no celular (PWA). Botões grandes, fotos com zoom por pinça, carregamento leve (miniaturas) para funcionar no 4G.

### 15.1 Lista de exames
- Abas por status: **Aguardando dados · Na fila/Gerando · Aguardando revisão · Prontos**, com contador em cada uma.
- Cada item: miniatura, nome do paciente, espécie, responsável, data, clínica (para o volante) e selo de **Urgente**.
- Busca por paciente ou responsável; filtro por data e clínica.

### 15.2 Tela do exame (edição simplificada)

A mesma tela serve para preencher, gerar e revisar. No **celular** é uma coluna só, com a barra de ações fixa embaixo. No **computador**, as fotos ficam à esquerda e o laudo à direita.

**Celular:**
```
┌─────────────────────────────┐
│ ← Lulu · Canina · 9a        │
│ Aguardando dados   [Urgente]│
├─────────────────────────────┤
│ [foto][foto][foto][foto] →  │  fotos: toque amplia
├─────────────────────────────┤
│ Dados do paciente      ✎    │  resumo; toque abre os campos
│ Responsável: Maria · Abdominal    │
│ ⚠ falta: solicitante        │
├─────────────────────────────┤
│ Informações adicionais      │
│ ┌─────────────────────────┐ │
│ │ Escreva ou dite o que   │ │
│ │ souber...           🎤  │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│   [ Gerar pré-laudo ]       │  barra fixa
└─────────────────────────────┘
```

**Depois da geração (revisão):**
```
┌─────────────────────────────┐
│ ← Lulu · Aguardando revisão │
├─────────────────────────────┤
│ Dados extraídos pela IA  ✎  │  conferir o que veio do texto
├─────────────────────────────┤
│ ▸ Fígado          Normal ✓  │  cada órgão é um bloco que
│ ▾ Rins        ⚠ Alterado    │  abre para editar o texto
│   Rim esq. 4,8 cm (ref 3,0–4,5)
│   [texto editável........]  │
│   [Aplicar normal]          │
│ ▸ Bexiga          Normal ✓  │
│ ...                         │
├─────────────────────────────┤
│ Impressão diagnóstica       │
│ [texto editável........]    │
├─────────────────────────────┤
│ Prancha: 6 fotos  [escolher]│
├─────────────────────────────┤
│ [Gerar de novo] [Aprovar e assinar] │
└─────────────────────────────┘
```

**Computador:**
```
┌──────────────────────────────┬───────────────────────────────┐
│  Fotos (grade, zoom,          │  Dados do paciente  ✎         │
│  marcação "No laudo")         │  Informações adicionais       │
│                               │  ─────────────────────────    │
│  Medidas × referência         │  Laudo por órgão (blocos)     │
│                               │  Impressão diagnóstica        │
│                               │  [Gerar de novo] [Aprovar]    │
└──────────────────────────────┴───────────────────────────────┘
```

Princípios da tela:
- **Nada é obrigatório para começar:** dá para só escrever no campo livre e gerar.
- Os dados podem ser preenchidos **à mão** a qualquer momento; o que a IA extraiu fica marcado para conferência.
- Os **avisos de campos faltando** aparecem, mas só bloqueiam na hora de **assinar**.

### 15.3 Laudo pronto
- Visualização do PDF, botão **Compartilhar** (seção 14), **Retificar**, histórico de versões e de envios.

### 15.4 Administração
- **Clínica:** dados e identidade do laudo, modo **automático/manual**, usuários e convites, máscaras e modelos, AE Title, token de ingestão.
- **Minha conta:** dados, CRMV/UF, imagem da assinatura, senha.
- **Sistema** (administrador do sistema): clínicas, consumo de IA, tabelas de referência.

## 16. Dados principais

| Entidade | Campos principais |
|---|---|
| Clinica | nome, documento, endereço, contato, logo, AE Title, token de ingestão, modo automático, ativa |
| Usuario | nome, e-mail, senha (hash), CRMV, UF, imagem da assinatura, logo próprio |
| Vinculo | usuário, clínica, perfil, identidade do laudo (clínica ou própria), ativo |
| Responsável (tutor) | clínica, nome, telefone, e-mail |
| Paciente | clínica, responsável, nome, espécie, raça, sexo, castrado, nascimento |
| Exame | clínica, paciente, StudyInstanceUID, tipo, data, peso, suspeita clínica, histórico, jejum, limitações, solicitante (nome, CRMV, clínica), informações adicionais (texto livre), urgente, status, modo, origem (dicom/upload/ingestão) |
| Imagem | exame, arquivo, número, é vídeo, imagem-chave, na prancha |
| Medida | exame, grupo, nome, valor, unidade |
| Laudo | exame, versão, conteúdo da IA (JSON), conteúdo revisado (JSON), IA usada, assinado por, assinado em, código de verificação, retificado por (versão), motivo |
| TarefaFila | exame, prioridade, status, tentativas, IA, tokens, custo, erro, datas |
| ModeloLaudo | clínica (ou padrão), tipo de exame, seções, máscaras de normalidade |
| Referencia | espécie, faixa de peso, órgão, medida, mínimo, máximo, unidade, fonte |
| Compartilhamento | laudo, meio (whatsapp/e-mail/link/pdf), destinatário, por quem, quando, validade do link |
| Auditoria | usuário, ação, entidade, data |

## 17. Ordem de construção

1. ✅ Banco + clínicas, usuários e **vínculos** + login + escolha de clínica.
2. ✅ Receptor DICOM identificando a clínica pelo AE Title, criando **paciente/responsável** e o exame no banco; endpoint de ingestão **desativado**.
3. ✅ (parcial) Lista de exames por status (responsiva) e detalhe com fotos.
4. ✅ Tela do exame: dados, **campo livre**, urgente, modo automático/manual, **Gerar pré-laudo** (entra na fila). A extração dos campos a partir do texto livre é feita pela IA no passo 5.
5. ✅ Fila + geração do pré-laudo (Claude, Gemini de reserva, ordem configurável) com o modelo abdominal e os **valores de referência** (tabela editável, medidas × faixa na revisão, enviadas à IA). Pendentes: máscaras editáveis por clínica; referências próprias por clínica.
6. ✅ Revisão por órgão (com "Normal") + prancha + **aprovar e assinar** + PDF com código de verificação e QR + retificação + página pública de verificação. Pendente: identidade própria do ultrassonografista no cabeçalho (hoje sai sempre a da clínica).
7. ✅ **Compartilhar** (WhatsApp, e-mail pelo SMTP próprio do usuário, PDF, link público com validade e revogação) + canais configuráveis por usuário + histórico de envios. Retificação feita no passo 6.

## 18. Cobrança da IA (créditos)

- Saldo em R$ por clínica; crédito inicial configurável para clínicas novas (padrão R$ 40).
- Débito por geração = custo real (tokens × preço do modelo × câmbio) × fator (padrão 2 = 100% de margem). Erro e "nada mudou" não cobram.
- Bloqueio sem saldo; recargas e ajustes pelo administrador do sistema, com extrato.
- A clínica vê saldo e estimativa de pré-laudos restantes (média dos últimos 20).
- O administrador do sistema configura fator, câmbio, preços dos modelos e o próprio saldo no provedor (com alerta).
- Futuro: recarga pela própria clínica (Pix automático), pacotes com desconto, nota fiscal.

## 19. Fases seguintes (fora da 1ª versão)

- Outros tipos de exame (gestacional, cervical, ocular, musculoesquelético, torácico, A-FAST/T-FAST).
- Upload manual de imagens (aparelhos sem DICOM).
- Limites de uso de IA por clínica (créditos/franquia).
- Notificações (laudo aguardando revisão, laudo pronto).
- DICOM Worklist (dados do paciente aparecendo prontos no ultrassom).
- Assinatura digital ICP-Brasil / gov.br.
- TLS no DICOM; prazo de guarda e política de exclusão de fotos.
