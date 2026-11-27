# Coordenação entre os agentes (Claude Code × Google Antigravity)

Quadro compartilhado. **Leia antes de começar qualquer tarefa e atualize ao começar e ao terminar.**
As regras completas estão em [AGENTS.md](../AGENTS.md).

**Protocolo resumido**
1. Leia este arquivo, rode `git status` e `git log --oneline -10`.
2. Ao começar: acrescente sua linha em **Em andamento** (agente, tarefa, arquivos).
3. Não mexa em arquivo listado em "Em andamento" por outro agente: avise o usuário.
4. Ao terminar: tire sua linha de "Em andamento" e escreva no topo do **Registro** (mais novo em cima).
5. Padrão novo decidido com o usuário → registre em **Decisões**.
6. Commit e push só quando o usuário pedir.

---

## Em andamento

| Agente | Desde | Tarefa | Arquivos |
|---|---|---|---|
| — | — | (nenhuma tarefa em andamento) | — |

---

## Decisões (padrões combinados com o usuário)

- **Deploy**: a versão sobe por `node ferramentas/deploy.js --nota "..."` (ver `docs/VERSOES.md`). **Produção é a VPS**
  (26/11/2026): commit/push → Actions "publicar" → `docker compose pull plataforma && docker compose up -d plataforma` na VPS
  (ver [PRODUCAO.md](PRODUCAO.md)). O Docker local é só desenvolvimento e teste.
- **DICOM**: o receptor é outro projeto; nenhum dos dois agentes mexe nele nesta frente.
- **Prompt da IA**: visível só ao administrador do sistema (tela "IA (sistema)"); clínicas não veem.
- **Aprendizados da IA**: discordâncias de alertas e órgãos confundidos valem para todas as clínicas (priorizando a própria);
  o estilo de escrita (ditados) é por clínica.
- **Clínicas de teste (`Clinica.Teste`)**: funcionam normalmente para validar laudos, correções e relatórios, mas ficam isoladas
  (clínicas reais nunca leem correções de clínicas de teste nem copiam fotos delas para `_treino`; financeiro/cobrança e
  registros de sistema mostram só clínicas reais por padrão, com filtro para conferir `Somente testes` / `Todas`; custo real de
  IA em testes continua descontado do saldo dos provedores e aparece separado como custo interno).
- **Anotação manual de imagens**: camada separada em `anotacoes_imagem` (coordenadas 0..1, foto original intacta), no estilo
  visual do aparelho Mindray (texto branco maiúsculo, cursores amarelos `+` e `×`, linha pontilhada e quadro inferior direito
  com borda ciano); aparece na tela (com mostrar/ocultar), na prancha do PDF (`LayoutLaudo.MostrarAnotacoes = true` por padrão,
  desenhado em memória com SkiaSharp), entra nas medidas/referências (`origem: "manual"`), no prompt da IA e gera rótulo de
  treino automático. Bloqueada após assinar (libera ao retificar).
- **Padrão do laudo (Gabriela Peil)**: órgãos na ordem Fígado, Vesícula Biliar, Estômago, Alças Intestinais, Pâncreas, Baço,
  Rins (uma linha), Adrenais, Vesícula Urinária, reprodutor, Linfonodos; descrição sem repetir o nome do órgão; medidas em cm
  com vírgula; "Peristaltismo presente e evolutivo"; sem "(castrado/castrada)" no sexo.
- **Lint fora do trabalho dos agentes** (pedido do usuário, 26/11/2026): os agentes não rodam o lint (gasta tokens); ele roda no
  `.bat` de deploy e no GitHub. Para rodar à mão: `lint.bat` na raiz (`lint.bat front` ou `lint.bat api`).
- **Lint e segurança (CI)**: antes do build Docker roda o lint — front: `npm run lint` (Biome, `plataforma/front/biome.json`;
  regras que o código antigo ainda descumpre estão como aviso, o resto é erro) e `tsc`; API: `dotnet build -warnaserror` e
  `dotnet format analyzers`. Código novo não deve criar avisos novos. Testes de segurança em `tests/seguranca.js` (sempre por
  último: esgota o limite de logins). Deploy local com as mesmas validações: `C:Gitdeploy-autolaudovet.bat`.
- **Menus (cada coisa num lugar só)**: topo = lugares de trabalho (Exames, Mentoria com contador de revisões, Clínica, Sistema ▾);
  menu da conta = Minha conta, Ajuda, Sair; configurações da clínica em abas (Dados e funcionamento, Aparência do PDF, Usuários,
  Registros de atividade). Tela nova da clínica entra como aba; tela nova do sistema entra no menu Sistema ▾.
- **Medidas no editor de imagens** (implementado nas versões 0.10.23–0.10.24; calibração vale para a clínica inteira; mover foto pergunta sempre): sugestão de medida sem IA (régua da foto, calibração por toque), posição da caixa das medidas e órgão do
  editor coerente com o laudo — ver [PLANO-MEDIDAS-ANOTACAO.md](PLANO-MEDIDAS-ANOTACAO.md). Mexe no editor do Antigravity.
- **Recepção pela nuvem** (aprovado em 26/11/2026; receptor em repositório e sessão próprios) — API de ingestão com token por dispositivo, receptor DICOM na nuvem (TLS) e apps
  Windows/Android em repositórios próprios — ver [PLANO-INGESTAO.md](PLANO-INGESTAO.md).
- **Prancha**: sem limite de fotos; sugestão = todas as fotos associadas aos órgãos, na ordem dos órgãos, depois as que a IA destacou.
- **Revisão**: um botão "Salvar" (texto do laudo + dados do exame) e "Aprovar e assinar" na barra; nova análise à IA num link
  com "Atualizar com o que mudou" e "Refazer análise completa".
- **Pendente de decisão**: banco de frases e padrão de escrita por clínica (proposta: o atual vira da Gabriela; clínicas novas
  com padrão neutro e importação de .docx).
- **Pendente de decisão**: aprendizado de imagens e marcações vermelhas nas alterações — ver
  [PLANO-TREINAMENTO-IMAGENS.md](PLANO-TREINAMENTO-IMAGENS.md).
- **Revisão por mentor** (decidido, não implementado): Mentor/mentorado; **o administrador do sistema define quem é mentor**; edição bloqueada durante a revisão; "Revisado por" no PDF com permissão; peso 3×; revisão de laudo assinado só para ensino; gratuita. Detalhes: (tutores parceiros revisam laudos de iniciantes) — ver
  [PLANO-MENTORIA.md](PLANO-MENTORIA.md). Nome decidido: **Mentor** / mentorado (`Tutor` no código é o dono do animal).

---

## Registro (mais novo em cima)

### 27/11/2026 — Claude (versão 0.10.33)
- "Compartilhar por app" no celular dava "Permission denied": o `navigator.share` era chamado depois de baixar o PDF e o
  Chrome do Android perdia o toque. Agora o PDF é baixado quando o cartão abre e o compartilhar sai direto no clique;
  cancelar não vira erro e o envio só é registrado se der certo (`paginas/Compartilhar.tsx`).

### 26/11/2026 — Claude (sessão do receptor): produção na VPS
- **Produção mudou para a VPS** (`https://app.autolaudovet.tech`, ver [PRODUCAO.md](PRODUCAO.md)): Caddy + plataforma +
  postgres + receptor em `/opt/vetus/producao`, imagens do ghcr.io (publicação manual no CI, depois de todos os testes).
- **Migrados só os dados da Gabriela Peil** (clínica 1, `VETUS_C0001`) e o usuário Administrador; clínicas de teste e seus
  usuários, aprendizados e registros ficaram só no PC. **O Docker do PC deixou de ser produção** (plataforma parada).
- API: `VETUS_PROXY_IP` (cabeçalhos X-Forwarded-* só do IP do Caddy): limite de logins pelo IP real e cookie `Secure`.
- Backup diário do banco e semanal dos arquivos (`producao/backup.sh`, cron na VPS).

### 26/11/2026 — Claude (versão 0.10.32)
- **API de ingestão v1** (etapa 1 do `PLANO-INGESTAO.md`; contrato em `docs/API-INGESTAO.md`): `/api/ingestao/v1` com `parear`,
  `eu`, `exames/verificar`, `PUT .../arquivos/{nome}` (X-SHA1 conferido), `concluir` e situação. Token por dispositivo
  (tabelas `dispositivos_ingestao` e `codigos_pareamento`, migração `*_Ingestao`); receptor do sistema com `X-AE-Chamado`.
- O recebimento do pendrive virou o serviço `Servicos/RecebimentoExames.cs`, usado pelo pendrive e pela ingestão (mesma
  junção de exames). `INGESTAO_HABILITADA` agora vem `true` (interruptor de emergência).
- Telas: aba "Aparelhos e apps" da clínica (`paginas/Aparelhos.tsx`: código de pareamento, apps, revogar) e "Receptores"
  no menu Sistema (`paginas/AdminReceptores.tsx`). Teste `tests/ingestao.js` (40 itens) no CI e no `.bat`.
- **Para o Antigravity (manual)**: falta um tópico "Aparelhos e apps" (parear o app de envio).

### 26/11/2026 — Claude (sem deploy)
- Criado `docs/PLANO-INGESTAO.md`: API de ingestão (token por dispositivo, pareamento, envio retomável), receptor DICOM na
  nuvem com TLS enviando pela API (sem volume compartilhado), apps Windows/Android e três repositórios. Só documento.

### 26/11/2026 — Antigravity (sem deploy — aguardando OK do usuário)
- **Revisão completa do Manual na tela Ajuda** (`plataforma/front/src/paginas/Ajuda.tsx`) alinhando todos os 18 tópicos às últimas telas e versões:
  - **Tópico 1**: contador de revisões em Mentoria, sino no topo, clínica/perfil (**Recepção**, **Veterinário**, **Administrador**)/CRMV no menu da conta e **Minha conta → Alterar minha senha**.
  - **Tópicos 3, 6 e 14**: status **"Assinado"** (no lugar de Pronto), selo **"🎓 Com o mentor"**, custo estimado nas duas opções de nova análise à IA e **"Saldo"** no lugar de créditos.
  - **Tópicos 5, 7, 8, 9 e 10**: selos `✦` (IA) e `✎` (anotação) nas fotos, vídeos + PDFs do pendrive, medidas manuais incluídas em **Medidas do aparelho × referência**, atalhos `✎`/`✓`/`✗` direto nas miniaturas de cada órgão, visões **☰ Por órgão** e **📄 Como vai ficar** (com `Escolher fotos da prancha` e `×`), e aprendizado alimentado por anotações e mentores (com peso maior).
  - **Tópicos 12, 13, 15 e 16**: nome padronizado `laudo_ultrassonografico_Paciente.pdf`, retificação liberando também dados/anotações, **Envio de laudos** corrigido de *Minha conta* para **Clínica → Dados e funcionamento → Envio de laudos** (com acessos dos links e histórico de envios), preservação de aprendizados ao excluir exame, e filtro dinâmico nos **Registros de atividade**.
  - **Tópicos 17 e 18**: mentoria completa (**🎓 Enviar ao mentor para revisão / para ensino**, rascunho do mentor, miniaturas com marcações do mentorado e anotações, *Confirmar os órgãos sugeridos*, limite de revisões e e-mail no perfil, *Marcar todos como lidos* no sino) e editor de imagens (**Órgão** vazio na foto ampliada / preenchido na miniatura, sugestão pela régua, `📐 Calibrar`, caixa nos 4 cantos ou arrastável, mover foto de órgão e botão `👁 Ocultar/Mostrar anotações`).

### 26/11/2026 — Claude (versão 0.10.29; a 0.10.28 foi publicada por fora)
- Situação "Pronto" aparece como **"Assinado"** (`exames.tsx`); selo **"🎓 Com o mentor"** na lista de exames (`comMentor` no
  `GET /api/exames`). Nova análise à IA com explicação simples e custo estimado (`mediaAtualizacao` no `GET /api/clinica/saldo`).
  "Sua correção ensina a IA nos próximos exames" e agradecimento nas imagens do órgão (`Revisao.tsx`). "Saldo" no lugar de
  "créditos" e prancha explicada ("as fotos que vão no PDF").
- **Para o Antigravity (manual)**: o manual ainda fala em "Pronto" e "créditos"; trocar por "Assinado" e "saldo", e citar o
  selo "Com o mentor" e o custo estimado da nova análise.

### 26/11/2026 — Claude (versão 0.10.27)
- **Revisão com duas visões** do mesmo laudo (chave no topo): "☰ Por órgão" (cartões) e "📄 Como vai ficar" (documento
  editável, antes uma janela à parte). Ao tocar num órgão no documento, aparece em cima dele a mesma barrinha de ferramentas
  (situação, frase pronta, Falar e Fotos → "Mais detalhes"). Uma barra só para salvar e assinar; a visão é lembrada no
  computador (localStorage `vetus.visaoRevisao`) e começa "Por órgão" no celular. `Revisao.tsx` (`ferramentas`, `aplicarFrase`),
  `DocumentoEditavel.tsx` (embutido, sem a moldura de tela cheia), manual (Ajuda).

### 26/11/2026 — Claude (versão 0.10.26; a 0.10.25 foi publicada por fora)
- Usabilidade: perfil Usuario aparece como **Recepção** (`api.ts`, `Registros.tsx`, textos dos registros em `ClinicaEndpoints.cs`);
  filtro dos Registros só com os tipos que existem; nome da clínica no menu da conta; "📐 Calibrar" só quando a régua não é achada.
- `lint.bat` na raiz para o usuário rodar o lint à mão; os agentes deixam de rodar o lint (regra 5 do `AGENTS.md`).

### 26/11/2026 — Claude (versões 0.10.23 e 0.10.24)
- **Editor de imagens** (plano em `docs/PLANO-MEDIDAS-ANOTACAO.md`; a 0.10.23 foi publicada por fora com este código):
  - teste da régua: `ferramentas/teste-regua.py` achou a escala em 35 de 35 fotos reais do Mindray Vetus E7;
  - caixa das medidas com posição (item `quadro`: cantos ou livre, arrastável), na tela e no PDF
    (`DesenhoAnotacao.CantoAutomatico`);
  - órgão coerente: ao salvar, pergunta "Mover esta foto para X?" (`Revisao.moverFotoParaOrgao`); o rótulo segue a última escolha;
  - sugestão de medida sem IA (`src/regua.ts`): régua da imagem, outras medidas da foto ou calibração por toque (tabela
    `calibracoes_imagem`, migração `20261126103341_CalibracaoImagem`, `Endpoints/CalibracaoEndpoints.cs`, vale para a clínica);
  - barra do editor com altura fixa (a foto pulava entre o 1º e o 2º toque);
  - 0.10.24: aberto pela foto ampliada, o órgão começa vazio (antes vinha "Fígado" sem o veterinário perceber) e o texto de órgão
    escrito na foto (BAÇO, RIM E, VB…) define o órgão (`orgaoDoTexto`).
- `tests/anotacoes.js`: caixa, calibração e rótulo que acompanha a última escolha.

### 26/11/2026 — Claude (sem deploy)
- Criado `docs/PLANO-MEDIDAS-ANOTACAO.md`: sugestão de medida sem IA, posição da caixa das medidas e órgão do editor coerente
  com o laudo. Só documento. O último CI (commit `ca5b190`) falhou em "Build das imagens"; a imagem da plataforma constrói sem
  erro localmente (sem cache): provável falha passageira de rede, rodar de novo no GitHub.

### 26/11/2026 — Claude (versão 0.10.22)
- **Menus sem repetição** (`App.tsx`): topo Exames · Mentoria (contador de revisões pendentes do mentor) · Clínica · Sistema ▾
  (Clínicas, Mentores, Cobrança, Referências, IA, Registros); menu da conta só Minha conta, Ajuda, Sair (sem subtítulos); menu ☰ do
  celular só com os destinos do topo. Abas da clínica (`DadosClinica.tsx` → `AbasClinica`) com "Registros de atividade";
  `Registros.tsx` usa as abas na visão da clínica. Manual (tópicos 1, 16 e 17) atualizado.
- **CI**: `tests/anotacoes.js` falhava no GitHub porque o `exames.js` (só roda lá) grava "Fígado → Vesícula biliar" numa clínica
  real, a mesma frase que o teste usava para provar o isolamento da clínica de teste. Passou a usar "Pâncreas → Adrenal esquerda".
  Reproduzido e corrigido localmente.

### 26/11/2026 — Claude (versão 0.10.21)
- **Lint antes do Docker** (pedido do usuário): job `lint` no `.github/workflows/ci.yml`; o job dos containers só roda se ele
  passar. Biome no front (`biome.json`, script `lint`), `-warnaserror` e analisadores no .NET. Corrigidos os apontamentos em
  `RevisaoMentor.tsx` (funções no lugar de componentes internos, Esc/setas na foto ampliada), `Sino.tsx`, `AdminMentores.tsx`,
  `Mentoria.tsx`. Restam 114 avisos antigos (acessibilidade, dependências de efeitos) para corrigir aos poucos.
- **Segurança no CI**: job `seguranca-codigo` (Gitleaks no histórico, `npm audit` grave, NuGet vulnerável), job `codeql`
  (C# e TypeScript, `security-extended`), OWASP ZAP baseline no sistema no ar (relatório como artefato; hoje 0 falhas, 5 avisos
  informativos) e `tests/seguranca.js` (28 verificações). `.github/dependabot.yml` (npm, NuGet, Docker, Actions; receptor fora).
- **Cabeçalhos de segurança**: `Servicos/CabecalhosSeguranca.cs` (CSP só em HTML, X-Frame-Options, nosniff, Referrer-Policy,
  Permissions-Policy com microfone, COOP, HSTS em HTTPS) e sem cabeçalho `Server` (`Program.cs`).
- `C:Gitdeploy-autolaudovet.bat`: lint no passo 3, `-warnaserror` no passo 2 e `seguranca.js` no fim dos testes.
- Antes disso, por fora: versão 0.10.20 ("ajustes na tela de mentoria"), sem registro aqui.

### 26/11/2026 — Claude (versão 0.10.19)
- Revisão do mentor: o mentorado cancela a qualquer momento; o cancelamento descarta o que o mentor fez (conteúdo, comentários,
  rótulos e parecer) e avisa o mentor. Na tela do mentor, uma verificação a cada 15 s e o salvar/concluir mostram o modal
  "Revisão cancelada" (sem mensagem de erro) e voltam a "Pedidos de revisão". `RevisaoMentorEndpoints.cs`, `RevisaoMentor.tsx`,
  `EnviarMentor.tsx`, `Ajuda.tsx`, `tests/revisao-mentor.js`.

### 26/11/2026 — Claude (versão 0.10.18)
- Revisão do mentor: cada órgão mostra as mesmas miniaturas que o mentorado via (até 4 fotos de `orgaos[].imagens` do laudo enviado),
  com o que o mentorado confirmou/corrigiu (`rotulosMentorado`, último rótulo dele por foto) e o selo/camada das anotações
  (`anotacoes`). `RevisaoMentorEndpoints.cs`, `RevisaoMentor.tsx`, `tests/revisao-mentor.js`.

### 26/11/2026 — Claude (mentoria etapa 2, versão 0.10.16; logo depois saiu a 0.10.17 com os mesmos arquivos)
- Publicado com o OK do usuário pelo `C:Gitdeploy-autolaudovet.bat`, levando junto a anotação de imagens do Antigravity.
- Tabela `revisoes_mentor` (migração `20261126*_RevisaoMentor`, gerada pelo `dotnet ef`): laudo como foi enviado, conteúdo do
  mentor, comentários por órgão, órgão de cada foto, parecer, resultado (confirmado/sugestoes), "para ensino" (laudo assinado).
- API `Endpoints/RevisaoMentorEndpoints.cs`: `GET/POST /api/exames/{id}/revisao-mentor` (mentorado), `/api/revisoes-mentor`
  (lista do mentor, detalhe sem dados do responsável, fotos pela revisão, rascunho, concluir, cancelar).
- Laudo parado com revisão pendente (não ensino): `LaudoEmRevisao` em `LaudoEndpoints.cs` e `PUT/gerar` em `ExameEndpoints.cs`
  (`ComMentor`); GET do exame traz `revisaoMentor`. Fim da mentoria cancela as revisões pendentes (`MentoriaEndpoints.cs`).
- Telas: `paginas/EnviarMentor.tsx` (na tela do exame), `paginas/PedidosRevisao.tsx` (/mentoria/revisoes),
  `paginas/RevisaoMentor.tsx` (/mentoria/revisoes/:id, também só leitura para o mentorado); `ExameDetalhe.tsx` mostra o pré-laudo
  só para leitura enquanto está com o mentor. Manual (tópico 17) atualizado.
- Testes: `tests/revisao-mentor.js` (41 verificações) no CI; `tests/pendrive.js` espera a IA terminar antes de excluir (falhava
  por tempo com a fila cheia).
- Script `C:Gitdeploy-autolaudovet.bat` (fora do repositório, a pedido do usuário): compila, confere o front, roda os testes na
  cópia isolada, faz o deploy e confere a saúde (`--sem-testes`, `--so-validar`).

### 26/11/2026 — Antigravity (sem deploy — aguardando OK do usuário)
- **Anotação manual de imagens (texto + medida no estilo do ultrassom)**: tabela `anotacoes_imagem` (migração `20261126071500_AnotacoesImagem`, `Entidades.cs`, `VetusDb.cs`, `VetusDbModelSnapshot.cs`) e endpoints `GET/PUT/DELETE /api/exames/{id}/anotacoes` em `Endpoints/AnotacaoEndpoints.cs` (Veterinário e Administrador antes de assinar; registra `imagem_anotada` em `RegistroAtividades.cs` e gera rótulo automático em `RotulosImagem` quando a foto ainda não tinha rótulo).
- **Desenho estilo Mindray e integrações**: `Servicos/DesenhoAnotacao.cs` desenha em memória com SkiaSharp (texto branco maiúsculo contornado, cursores amarelos `+`/`×`, linha pontilhada e quadro com borda ciano) para a prancha do PDF em `PdfLaudo.cs` (`LayoutLaudo.MostrarAnotacoes = true` por padrão, configurável em `LayoutLaudo.tsx`), sem tocar no JPG original. Medidas manuais entram na comparação de referências (`ExameEndpoints.cs`) e no prompt da IA (`ServicoLaudo.cs`).
- **Editor visual e manual**: `paginas/EditorAnotacao.tsx` (toque/arraste em celular e PC, opção de inserir medida na descrição do órgão), botão `✎ Anotar` e `👁 Ocultar/Mostrar anotações` no visualizador (`ExameDetalhe.tsx`) e nas fotos de cada órgão (`Revisao.tsx`), selos `✎` nas miniaturas/prancha, e tópico 18 em `paginas/Ajuda.tsx`.
- **Testes ponta a ponta**: `tests/anotacoes.js` (29 verificações cobrindo anotações, PDF SkiaSharp, referências, IA, bloqueio pós-assinatura e isolamento de `Clinica.Teste`) adicionado ao CI (`.github/workflows/ci.yml`), validado em stack isolada `vetusteste` junto com `layout.js`, `pendrive.js`, `mentoria.js` e `plataforma.js`.

### 26/11/2026 — Claude (versão 0.10.15)
- **Mentoria, etapa 1** (plano em `docs/PLANO-MENTORIA.md`): tabelas `perfis_mentor`, `mentorias`, `notificacoes`
  (migração `20261126065739_Mentoria`, gerada pelo `dotnet ef`, que desta vez não foi bloqueado).
- API em `Endpoints/MentoriaEndpoints.cs`: `/api/admin/mentores` (administrador do sistema define/tira mentores; só com CRMV;
  tirar encerra as mentorias abertas), `/api/mentoria/perfil`, `/api/mentores` (diretório), `/api/mentorias` (pedir, aceitar,
  recusar, cancelar, encerrar) e `/api/notificacoes` (sino). `/api/auth/eu` devolve `mentor`.
- Serviço `Servicos/Notificacoes.cs`: aviso no sino e e-mail opcional pelo SMTP do sistema (`VETUS_SMTP_*` novos no
  `docker-compose.yml` e `.env.example`; vazio = só o sino). Novos tipos no registro de atividades (mentoria_*, mentor_*).
- Telas: `paginas/Mentoria.tsx` (/mentoria), `paginas/AdminMentores.tsx` (/admin/mentores, "Mentores (sistema)"),
  `Sino.tsx` no topo; manual (Ajuda) com o tópico 17. No celular, o nome da clínica (uma só) some do topo para caber o sino;
  o nome ao lado das iniciais pula "Dr./Dra.".
- Teste `tests/mentoria.js` (41 verificações) e passo no CI (`.github/workflows/ci.yml`).

### 26/11/2026 — Claude (sem deploy)
- Criado `docs/PLANO-MENTORIA.md`: mentoria entre veterinários (diretório, pedido/aceite, notificações, tela "Pedidos de
  revisão", comparação lado a lado, peso do mentor no aprendizado). Só documento.

### 26/11/2026 — Antigravity (versão 0.10.14)
- **Clínicas de teste (`Clinica.Teste`)**: coluna `Teste` em `clinicas` (migração `20261126034000_ClinicaTeste` + `Entidades.cs` + `VetusDbModelSnapshot.cs`).
- **Isolamento de correções da IA**: `Aprendizados.cs` restringe clínicas reais a aprendizados apenas de clínicas reais; clínicas de teste leem os aprendizados reais + os próprios (para validar via "IA (sistema) → Ver prompt"); `ExameEndpoints.cs` não copia fotos de clínicas de teste para `/pendrive/_treino/`.
- **Isolamento financeiro com filtro de validação**: `Cobranca.cs` exclui testes da média geral; `CobrancaEndpoints.cs` agrega `GET /api/admin/cobranca` só para clínicas reais (mostrando custo interno de testes separado) e adiciona `?escopo=reais|testes|todas` em `GET /api/admin/financeiro`; `AdminEndpoints.cs` e `RegistrosEndpoints.cs` permitem marcar/desmarcar clínica de teste e filtrar testes por padrão (`?incluirTestes=true`).
- **Telas admin**: `AdminClinicas.tsx` (checkbox na criação, botão "Marcar teste / Tornar real" e selo `TESTE`), `Financeiro.tsx` (seletor `Clínicas reais | Somente testes | Todas`), `AdminCobranca.tsx` (linha de custo interno em testes), `Registros.tsx` (checkbox "Incluir testes") e `AdminIa.tsx` (selo `TESTE`).

### 26/11/2026 — Claude (versão 0.10.13)
- CI: `tests/layout.js` falhava em "veterinário não altera / pode ver o layout" porque o login do veterinário batia no
  limite de 10 logins por minuto por IP (429) depois dos outros testes. Ganhou o mesmo `entrar()` com espera de 60 s e nova
  tentativa dos demais testes. Só teste; a API não mudou.

### 26/11/2026 — Claude (versão 0.10.12)
- Manual do cliente (`paginas/Ajuda.tsx`) atualizado com o que mudou até a 0.10.11: menu da conta, envio pelo celular e
  arquivos soltos, informações adicionais obrigatórias, nova análise (duas opções), alertas e "Discordo", frase pronta,
  ditado e padronização, editar como documento, prancha sem limite, como a IA aprende, Salvar único, excluir exame,
  Aparência do PDF e Registros de atividade. Tópicos renumerados (1 a 16).

### 26/11/2026 — Claude (sem deploy)
- Criado `docs/PLANO-TREINAMENTO-IMAGENS.md`: como o aprendizado de imagens funciona hoje e as etapas propostas
  (rótulos automáticos, OCR das anotações, gabarito, casos parecidos, modelo próprio) e as marcações vermelhas. Só documento.

### 25/11/2026 — Claude (versão 0.10.11)
- **Registro geral de atividades** substitui o registro só de exclusões: tabela `registros_atividade` (migração
  `20261125180000_RegistroAtividades`, que copia as exclusões de `exclusoes_exame` e apaga a tabela antiga).
- Serviço `Servicos/RegistroAtividades.cs` (`Adicionar` sem salvar, para usar dentro de transação; `Gravar` já salva) com a
  lista de tipos. Para registrar um evento novo: `await registros.Gravar(http, "tipo", "frase", exameId, paciente, detalhes)`
  e acrescentar o tipo em `RegistroAtividades.Tipos`.
- Eventos gravados: exame excluído, enviado pelo pendrive, análise pedida à IA, laudo assinado, retificado, discordância de
  alerta, usuário adicionado/alterado, dados da clínica, aparência do laudo, créditos lançados.
- Consultas: `GET /api/clinica/registros` (administrador da clínica) e `GET /api/admin/registros`, com `?tipo=&de=&ate=`
  (`Endpoints/RegistrosEndpoints.cs`, que substitui `ExclusoesEndpoints.cs`).
- Tela `paginas/Registros.tsx` (substitui `ExamesExcluidos.tsx`): rotas `/clinica/registros` (menu da conta → "Registros de
  atividade") e `/admin/registros` ("Registros (sistema)").
- `Acesso.VinculoSeHouver()` novo; uma linha em `PendriveEndpoints.cs` (registro no concluir).

### 25/11/2026 — Claude (versão 0.10.10)
- Registro de exames excluídos: tabela `exclusoes_exame` (migração `20261125160000_RegistroExclusoes`), gravada dentro da
  transação da exclusão em `ExameEndpoints.cs` (quem excluiu, e-mail, perfil, data, paciente, responsável, data do exame,
  ID do animal, situação, versões de laudo, se estava assinado e o código de verificação).
- Consultas: `GET /api/clinica/exclusoes` (administrador da clínica) e `GET /api/admin/exclusoes` (sistema), em
  `Endpoints/ExclusoesEndpoints.cs`.
- Telas: `paginas/ExamesExcluidos.tsx`; rota `/clinica/excluidos` (menu da conta → "Exames excluídos") e `/admin/exclusoes`
  (menu "Exclusões (sistema)"), em `App.tsx`.
- Testes em `tests/pendrive.js` (registro com o usuário, isolamento entre clínicas, acesso do sistema).

### 25/11/2026 — Claude
- Criados `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` e este arquivo, para os dois agentes trabalharem com os mesmos padrões.
- Prancha: fotos associadas aos órgãos primeiro, na ordem dos órgãos (`Revisao.tsx`, `PdfLaudo.cs`). Versão 0.10.9.
- Revisão: "Salvar" único e "Aprovar e assinar" na barra; link "Pedir nova análise à IA" com as duas opções
  (`Revisao.tsx`, `ExameDetalhe.tsx`). Versão 0.10.8.
- `ferramentas/deploy.js` passou a reconstruir só plataforma + banco (`--tudo` inclui o resto).
- Prancha sem limite de fotos (`LaudoEndpoints.cs`, `PdfLaudo.cs`, `Revisao.tsx`, `DocumentoEditavel.tsx`).
- Excluir exame por completo, inclusive arquivos do pendrive (`ExameEndpoints.cs`, `ExameDetalhe.tsx`).
- Saldo por provedor (Gemini R$ / Claude US$) e financeiro por clínica (`CobrancaEndpoints.cs`, `Financeiro.tsx`,
  migração `SaldosProvedores`).
- Tela "IA (sistema)" para ver o prompt de cada exame (`AdminIa.tsx`, `VerPrompt.tsx`).

### Até 25/11/2026 — outro agente (visto pelos commits e arquivos)
- Commit `d31da1b`: pacote desktop do AutoLaudoVet e agente local (`autolaudovet.desktop/`, `agente/`,
  `docs/PLANO-AGENTE-LOCAL.md`); aprendizados globais.
- Commit `446a463`: estilo de títulos em faixa com cor de fundo no laudo.
- Ainda sem commit: envio de fotos soltas pelo celular e `.jpeg` no pendrive (`EnvioPendrive.tsx`, `PendriveEndpoints.cs`);
  ajustes em `App.tsx`, `Usuarios.tsx`, `Compartilhar.tsx`, `MinhaConta.tsx`, `DadosClinica.tsx`.
