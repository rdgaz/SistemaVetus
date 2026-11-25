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
- **Padrão do laudo (Gabriela Peil)**: órgãos na ordem Fígado, Vesícula Biliar, Estômago, Alças Intestinais, Pâncreas, Baço,
  Rins (uma linha), Adrenais, Vesícula Urinária, reprodutor, Linfonodos; descrição sem repetir o nome do órgão; medidas em cm
  com vírgula; "Peristaltismo presente e evolutivo"; sem "(castrado/castrada)" no sexo.
- **Prancha**: sem limite de fotos; sugestão = todas as fotos associadas aos órgãos, na ordem dos órgãos, depois as que a IA destacou.
- **Revisão**: um botão "Salvar" (texto do laudo + dados do exame) e "Aprovar e assinar" na barra; nova análise à IA num link
  com "Atualizar com o que mudou" e "Refazer análise completa".
- **Pendente de decisão**: banco de frases e padrão de escrita por clínica (proposta: o atual vira da Gabriela; clínicas novas
  com padrão neutro e importação de .docx).

---

## Registro (mais novo em cima)

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
