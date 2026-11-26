# Plano: revisão por mentor (tutores parceiros)

Proposta de 26/11/2026, **decisões tomadas** (fim do documento). **Etapas 1 e 2 implementadas**; etapas 3 a 5 ainda não.

## A ideia

Parte dos usuários são veterinários experientes, muitas vezes professores. Um veterinário (em geral, iniciante) procura um
deles, pede para tê-lo como **mentor** e, depois do aceite, manda laudos para revisão antes de assinar. O mentor revisa o
texto e as imagens. O solicitante vê o que mudou, escolhe o que usar e assina. O que o mentor define vira aprendizado da IA,
com **mais peso** que uma revisão comum.

### Nome: "mentor", não "tutor"
Na veterinária, **tutor** é o dono do animal, e no sistema `Tutor` já é a entidade do responsável (`Dados/Entidades.cs`).
Usar a mesma palavra para o professor confunde a tela e o código. Proposta:
- **Mentor**: quem revisa (na tela: "Mentor", "Mentores parceiros").
- **Mentorado**: quem pede a revisão.
- **Revisão do mentor**: o pedido.

## Fluxo

```
Mentorado                                  Mentor
─────────                                  ──────
1. Procura mentores e pede indicação ───►  2. Notificação: "Novo pedido de mentoria"
                                            Aceita ou recusa
3. Na revisão do laudo: "Enviar ao mentor"
   (com uma mensagem opcional) ──────────► 4. Notificação → tela "Pedidos de revisão"
   Exame fica "Em revisão do mentor"          Revisa o texto, confirma/corrige as imagens,
                                              comenta e toca "Concluir revisão"
5. Notificação: "Laudo revisado pelo mentor" ◄─┘
   Comparação lado a lado: o meu × o do mentor
   Escolhe por trecho (ou "Aceitar todas") e confirma
6. Assina normalmente (a assinatura é do mentorado)
```

## 1. Encontrar e vincular o mentor

- **Quem define os mentores é o administrador do sistema** (decidido em 26/11/2026): na tela "Clínicas (sistema)" ou numa
  tela "Mentores (sistema)", ele busca o usuário e marca **Mentor** (só veterinários com **CRMV cadastrado**). Pode desativar
  depois; as mentorias abertas são avisadas e encerradas.
- O mentor completa o próprio perfil em **Minha conta → Mentoria**: áreas de atuação (ex.: abdominal, felinos), mini currículo,
  instituição, limite de pedidos abertos, se aceita novos mentorados e se permite "Revisado por" no PDF.
- **Diretório de mentores** (todas as clínicas): nome, CRMV/UF, áreas, instituição, nº de revisões feitas, tempo médio de resposta.
  Busca por nome e área.
- **Pedido de indicação**: o mentorado envia com uma mensagem. O mentor **aceita ou recusa**; pode encerrar a mentoria depois.
- O vínculo é **entre pessoas**, não entre clínicas: o mentor pode estar em outra clínica.

## 2. Enviar um laudo para revisão

- Na revisão, botão **"Enviar ao mentor"** (só com mentoria aceita). Escolhe o mentor (se tiver mais de um) e escreve uma
  mensagem ("Fiquei em dúvida no baço").
- O sistema guarda uma **cópia do laudo como foi enviado**: é a base da comparação depois.
- O exame mostra o aviso **"Laudo em revisão do mentor"** (implementado como revisão pendente, sem situação nova do exame). Enquanto isso, o mentorado **não edita** o texto
  (evita conflito); pode **cancelar o pedido** se o mentor ainda não começou.
- Sem custo de IA: a revisão do mentor não consome créditos.

## 3. Notificações

Hoje o sistema não tem notificações. Proposta:
- **Sino no topo** com contador e lista: novo pedido de mentoria, mentoria aceita/recusada, laudo para revisar, laudo revisado.
  Tocar leva direto à tela certa.
- **E-mail** opcional (usa o SMTP do sistema), ligado por padrão para o mentor.
- Depois: notificação no celular (PWA) e WhatsApp.

## 4. Tela do mentor: "Pedidos de revisão"

- Abas: **Pendentes**, **Revisados** e **Todos**, com mentorado, espécie, tipo, data do pedido e tempo de espera.
- Abre uma tela igual à revisão de hoje (reaproveita `Revisao.tsx` em "modo mentor"):
  - edita o texto de cada órgão, condições técnicas, impressão, diferenciais e recomendações;
  - muda Normal / Alterado / Não visibilizado;
  - **confirma ou corrige o órgão de cada imagem** (os mesmos botões "É este órgão / Não é este órgão");
  - opina sobre o alerta da IA, se houver;
  - comentário por órgão e um **parecer geral** para o mentorado.
- **"Confirmar sem alterações"** (um toque) ou **"Concluir revisão"**.
- O mentor **não assina** e não vê os dados do responsável (nome, telefone, e-mail), nem o saldo e as configurações da clínica.

## 5. Resposta ao mentorado e comparação

- Situação do exame: volta para "Aguardando revisão", com o selo **"Revisado pelo mentor"** e um destes resultados:
  - **"Laudo confirmado pelo mentor"**: nenhuma alteração;
  - **"Revisado com sugestões"**: há mudanças a decidir.
- **Comparação lado a lado** por seção: "Seu texto" × "Sugestão do mentor", com as palavras removidas riscadas em vermelho e
  as acrescentadas em verde; o comentário do mentor aparece no trecho.
- Em cada seção: **"Manter o meu"** ou **"Usar o do mentor"**. Atalhos: **"Aceitar todas as sugestões"**.
- Imagens cujo órgão o mentor corrigiu aparecem marcadas.
- **"Confirmar escolhas"** aplica no laudo; depois o fluxo é o de sempre (revisar, assinar).
- Histórico guardado: enviado, sugestão do mentor, escolha final (útil para a mentoria e para medir a IA).

## 6. Base de conhecimento (aprendizado da IA)

Hoje (`Servicos/Ia/Aprendizados.cs`) vão para a IA: órgãos confundidos (`rotulos_imagem`), alertas descartados
(`discordancias_alerta`) e exemplos de ditado (`ditados_orgao`).

- **Imagens**: os rótulos do mentor gravam em `rotulos_imagem` com `Origem = "mentor"`.
  - Contam **3 vezes** na contagem das confusões de órgão (peso configurável).
  - Para a mesma foto (mesmo hash), **o rótulo do mentor prevalece** sobre o de outro usuário.
  - Viram o "gabarito" preferido para medir o acerto da IA (etapa 2 do [plano de imagens](PLANO-TREINAMENTO-IMAGENS.md)).
- **Achados**: o que o mentor ajusta vira uma nova tabela `correcoes_mentor` (órgão, texto antes, texto do mentor, situação
  antes/depois, se o mentorado aceitou). Entra na IA como:
  - **achados perdidos/excessivos** (ex.: "a IA e o veterinário disseram normal; o mentor viu lama biliar"), global, com
    prioridade sobre as correções comuns;
  - exemplos de escrita correta (só quando o mentorado aceitou, para refletir o padrão da clínica).
- **Alertas**: a opinião do mentor sobre o alerta grava em `discordancias_alerta` com a mesma origem e peso.
- Vale o filtro novo de clínicas de teste: aprendizados de clínicas de teste não entram nas reais.

## 7. Dados (resumo técnico)

| Tabela nova | Para quê |
|---|---|
| `perfis_mentor` | usuário, ativo, definido por (admin) e quando, áreas, mini currículo, instituição, limite de pedidos, aceita novos, permite "Revisado por" |
| `mentorias` | mentor, mentorado, situação (pedida, aceita, recusada, encerrada), mensagem, datas |
| `revisoes_mentor` | exame, laudo/versão, mentor, mentorado, situação (pendente, em andamento, concluída, cancelada), cópia enviada (JSON), texto do mentor (JSON), parecer, escolhas finais (JSON), datas |
| `correcoes_mentor` | por órgão: antes × depois, aceito ou não |
| `notificacoes` | usuário, tipo, texto, link, lida, data |

- Colunas novas: `rotulos_imagem.Origem` e `discordancias_alerta.Origem` (`veterinario` / `mentor`).
- Nova situação do exame: `EmRevisaoMentor`.
- Endpoints em `Endpoints/MentoriaEndpoints.cs` (`/api/mentores`, `/api/mentorias`, `/api/revisoes-mentor`, `/api/notificacoes`).
  O mentor acessa o exame de outra clínica **só pelo pedido**: um filtro próprio confere que ele é o mentor daquela revisão.
- Registros de atividade: mentoria pedida/aceita, laudo enviado ao mentor, revisão concluída, sugestões aceitas.

## 8. Privacidade e responsabilidade

- O laudo continua sendo **do veterinário que assina**; o mentor dá uma sugestão.
- O mentor vê fotos, dados do animal e o laudo; **não vê** os dados do responsável.
- As fotos podem ter o nome do paciente/clínica no cabeçalho: o recorte automático do cabeçalho (etapa 1 do plano de
  imagens) também serve aqui.
- Aceite de termo no primeiro acesso como mentor e ao pedir mentoria (uso dos dados só para ensino e revisão).

## 9. Etapas sugeridas

1. ✅ **Mentoria e pedidos** (0.10.15): o administrador do sistema define os mentores, perfil do mentor, diretório, pedido/aceite, sino de notificações e e-mail.
2. ✅ **Revisão do mentor** (sem a escolha por trecho, que é a etapa 3): enviar, tela "Pedidos de revisão", revisão com imagens, concluir/confirmar.
3. **Comparação e escolha**: lado a lado, manter/usar por seção, aceitar todas, histórico.
4. **Aprendizado**: origem e peso nos rótulos e alertas, `correcoes_mentor` no prompt.
5. Depois: estatísticas para o mentor e o mentorado (o que mais é corrigido), "revisado por" no PDF, remuneração do mentor.

## Decisões do usuário (todas tomadas em 26/11/2026)

1. ~~Nome na tela~~ — **decidido em 26/11/2026: Mentor** (e mentorado).
2. ~~Edição durante a revisão~~ — **decidido em 26/11/2026: bloqueada**; o mentorado pode cancelar o pedido enquanto o mentor não começou.
3. ~~"Revisado por" no PDF~~ — **decidido em 26/11/2026: sim, com permissão**: o mentor autoriza uma vez no perfil e o mentorado escolhe, em cada laudo, se mostra "Revisado por Dr(a). X — CRMV/UF".
4. ~~Peso do mentor~~ — **decidido em 26/11/2026: 3×** (configurável); na mesma foto, o rótulo do mentor prevalece.
5. ~~Laudo já assinado~~ — **decidido em 26/11/2026: sim, para ensino**: o laudo assinado não muda; o mentorado recebe a comparação e o parecer, as correções alimentam o aprendizado e, se houver erro importante, ele decide se retifica.
6. ~~Cobrança~~ — **decidido em 26/11/2026: gratuita por enquanto**; cobrança/remuneração fica para uma etapa futura.
7. ~~Quem é mentor~~ — **decidido em 26/11/2026: o administrador do sistema define**; o próprio usuário não se oferece.
