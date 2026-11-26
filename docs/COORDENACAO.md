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

- **Deploy**: sempre por `node ferramentas/deploy.js --nota "..."`, que sobe a versão (ver `docs/VERSOES.md`); só plataforma + banco.
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
