# AutoLaudoVet — regras para os agentes de IA (Claude Code e Google Antigravity)

Este arquivo vale para **qualquer agente** que trabalhe neste repositório. Leia-o inteiro antes de começar e siga o
protocolo de coordenação em [docs/COORDENACAO.md](docs/COORDENACAO.md): é por ele que os dois agentes sabem o que o outro
está fazendo.

## 1. Coordenação entre os agentes (obrigatório)

Dois agentes trabalham neste projeto ao mesmo tempo: **Claude Code** e **Google Antigravity**. Para não um desfazer o
trabalho do outro:

1. **Antes de começar**: leia [docs/COORDENACAO.md](docs/COORDENACAO.md) (seções "Em andamento" e "Registro") e rode
   `git status` e `git log --oneline -10`. Se um arquivo que você vai mudar está em "Em andamento" com o outro agente,
   **não mexa nele**: avise o usuário.
2. **Ao começar uma tarefa**: acrescente uma linha em "Em andamento" com o seu nome (Claude ou Antigravity), a tarefa e os
   arquivos que vai alterar.
3. **Ao terminar**: tire a sua linha de "Em andamento" e acrescente no topo do "Registro" o que mudou (data, agente, resumo,
   arquivos, versão do deploy). Se tomou uma decisão de padrão, registre em "Decisões".
4. **Arquivo alterado no disco sem você ter feito** = foi o outro agente ou o usuário. Trate como o estado atual: não reverta.
5. **Nunca faça commit nem push** sem o usuário pedir. Quem faz commit é o usuário.

## 2. O produto

AutoLaudoVet ("um produto Moderno Tech"): plataforma em nuvem para várias clínicas veterinárias. Recebe exames de
ultrassom (pendrive ou DICOM), gera um **pré-laudo com IA** (Gemini principal, Claude reserva), o veterinário revisa e
assina, e o laudo sai em PDF com QR de verificação. Cobrança em créditos por clínica.
Especificação: [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md). Versões: [docs/VERSOES.md](docs/VERSOES.md).

## 3. Estrutura

| Pasta | O que é |
|---|---|
| `plataforma/api` | API .NET 10 (minimal APIs), EF Core 10 + PostgreSQL 17, QuestPDF, cookie de login |
| `plataforma/front` | React 19 + TypeScript + Vite + Tailwind 4 (telas em português) |
| `plataforma/api/Recursos/frases.json` | Banco de frases dos laudos (modelo "Laudo Fácil") |
| `receptor/` | Receptor DICOM — **outro projeto**, ver regra 5.6 |
| `tests/` | Testes de ponta a ponta em Node (`plataforma.js`, `layout.js`, `pendrive.js`; `exames.js` depende do DICOM) |
| `ferramentas/` | `deploy.js` (deploy com versão), `simular-ultrassom.js`, `empacotar-desktop.js` |
| `autolaudovet.desktop/`, `agente/` | Pacote desktop e agente local (ver [docs/PLANO-AGENTE-LOCAL.md](docs/PLANO-AGENTE-LOCAL.md)) |

## 4. Padrões de código

- **Tudo em português**: nomes de classes, métodos, variáveis, rotas, comentários e textos de tela
  (`Exame`, `Laudo`, `ServicoLaudo`, `/api/exames/{id}/laudo`). Textos de tela em português do Brasil, frases curtas.
- **API**: endpoints em `plataforma/api/Endpoints/*Endpoints.cs` com `Mapear(app)` registrado em `Program.cs`.
  Erros sempre `{ "erro": "mensagem" }` (use `Erros.Invalido`, `Erros.NaoEncontrado`, `Erros.Conflito`).
  Acesso por clínica com `.ExigirClinica(...)`; administração do sistema com `.ExigirAdministradorSistema()`.
- **Banco**: entidades em `Dados/Entidades.cs`, mapeamento em `Dados/VetusDb.cs`.
  **Migrações**: o `dotnet ef migrations add` costuma ser **bloqueado pelo Controle de Aplicativos do Windows**. Quando
  acontecer, escreva a migração à mão em `Dados/Migracoes/AAAAMMDDhhmmss_Nome.cs` (com `[DbContext]` e `[Migration]`) e
  acrescente as propriedades no `VetusDbModelSnapshot.cs`. Dados existentes: corrigir com SQL na própria migração.
- **Front**: páginas em `plataforma/front/src/paginas/`, componentes visuais em `src/ui.tsx`, chamadas com `api()` de
  `src/api.ts`. Cor da marca `#0E4D64`. Pensar sempre em **celular e computador**.
- **Laudo/IA**: regras do prompt em `Servicos/Ia/ModeloLaudo.cs` (padrão do médico, alertas, órgãos), montagem em
  `Servicos/Ia/ServicoLaudo.cs`, PDF em `Servicos/PdfLaudo.cs` (layout configurável por clínica em `LayoutLaudo.cs`).
  Nunca inventar medidas; medidas em cm com vírgula; órgãos na ordem e com os nomes de `ModeloLaudo.OrgaosAbdominal`.
- Comentários explicam o **porquê**, em português, curtos.

## 5. Regras de operação

1. **Segredos**: nunca ler, mostrar, copiar ou versionar o `.env` (chaves de IA, senhas). Só o `.env.example` vai para o Git,
   com valores de exemplo.
2. **Dados de pacientes**: a pasta `dados/` nunca vai para o Git.
3. **Deploy (sempre com versão nova)**: `node ferramentas/deploy.js --nota "o que mudou"` — sobe a versão do sistema,
   registra em `docs/VERSOES.md` e reconstrói **só a plataforma web e o banco** no Docker. Não rode
   `docker compose up --build` direto para publicar.
4. **Testes**: rodam numa cópia isolada (projeto `vetusteste`, outras portas), nunca no banco do usuário. Depois de testar,
   derrube a cópia com `down -v` e confira que a stack do usuário (`vetus-plataforma`, `vetus-postgres`) está no ar.
5. **Antes de dizer que terminou**: `dotnet build` na API e `npx tsc --noEmit` no front sem erros. **Não rodar o lint** durante o
   trabalho (gasta tokens): ele roda no deploy (`C:Gitdeploy-autolaudovet.bat`) e no GitHub; o usuário roda `lint.bat` (raiz) quando quiser.
6. **DICOM é outro projeto**: não suba, pare, depure nem encerre o receptor DICOM nem o processo na porta 2345.
7. **Dados do usuário** (exames, laudos, clínicas): não apague nem altere sem o usuário pedir explicitamente.
8. Prompt da IA é segredo do produto: só o **administrador do sistema** vê (tela "IA (sistema)").
