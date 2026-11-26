# Plano: melhorar o aprendizado de imagens da IA

Proposta discutida com o usuário em 25–26/11/2026. **Ainda não implementado** — aguardando aprovação de cada etapa.

## Como funciona hoje

- A IA **não é treinada** com as imagens. O sistema guarda as correções do veterinário e, a cada análise, manda um resumo
  em texto junto com o pedido (`Servicos/Ia/Aprendizados.cs`).
- **Rótulos de foto** (tabela `rotulos_imagem`, entidade `RotuloImagem`): quando o veterinário confirma ou corrige o órgão de
  uma foto, grava clínica, exame, versão do laudo, nome da foto, impressão digital (SHA-1), órgão da IA, órgão correto e
  tipo (`confirmacao`/`correcao`).
- **Fotos**: ficam na pasta do exame. Só quando o exame é excluído as fotos rotuladas são copiadas para `<pendrive>/_treino/<hash>.jpg`
  (`ExameEndpoints.cs`, exclusão).
- **O que vai para a IA** (global, priorizando a própria clínica): até 8 confusões de órgão mais frequentes e 8 alertas
  descartados; por clínica: 3 exemplos de ditado.

**Limitações**
- A IA só recebe a dica em texto; nunca revê a foto que errou.
- Confirmações são gravadas, mas não usadas no prompt (só correções).
- Só se aprende "qual órgão é", nunca **onde** está a alteração na foto.

## Etapas propostas (ordem recomendada)

### 1. Mais e melhores rótulos, sem trabalho extra do veterinário
- **Rótulo automático ao assinar**: fotos que ficaram em cada órgão viram confirmação; órgão cuja descrição o veterinário
  mudou passa a contar como "alterado".
- **Ler (OCR) o texto escrito na foto** pelo operador ("RIM E", "VB", "BAÇO"): `DetectorAnotacoes` já detecta que há
  anotação, mas não lê o texto. Rótulo quase de graça.
- **Copiar para `_treino` ao assinar** (não só ao excluir), com um JSON por foto: espécie, órgão, achado, marcação.
- **Anonimizar**: recortar o cabeçalho com nome do paciente/clínica antes de entrar na base.

### 2. Medir o acerto (gabarito)
- Separar 50–100 exames assinados como gabarito.
- Medir a cada mudança de prompt ou modelo: acerto de órgão por foto, alertas (falsos alarmes / achados perdidos),
  fidelidade das medidas.
- Tela do administrador do sistema com a evolução.

### 3. Casos parecidos como exemplo (sem treinar modelo)
- Calcular a "impressão visual" (embedding) de cada foto rotulada.
- Num exame novo, buscar as fotos confirmadas mais parecidas e mandar 1–3 delas à IA com a resposta certa.
- Custo: algumas fotos a mais por exame.

### 4. Modelo próprio (meses adiante)
- Com milhares de fotos rotuladas e marcações aprovadas: modelo pequeno para identificar o órgão e apontar alterações
  comuns, como triagem antes do Gemini.
- Bases públicas de ultrassom veterinário são escassas; humanas não servem bem e costumam proibir uso comercial.

## Marcações vermelhas nas alterações (proposta relacionada)

- Hoje a IA devolve só **números de fotos** (por órgão, alerta e prancha), sem posição dentro da foto (`ModeloLaudo.Esquema`).
- Proposta: o Gemini devolve, só para alterações, `{ imagem, achado, caixa: [topo, esquerda, base, direita] }` em escala 0–1000.
- Tela: contorno vermelho fino por cima da foto (camada, a original não muda), com mostrar/esconder; o veterinário
  aprova ou remove cada marcação.
- PDF: só as marcações aprovadas, com opção nas configurações do laudo.
- Se o laudo vier do Claude (reserva), pedir só as marcações ao Gemini depois, sem refazer o laudo.
- Marcações aprovadas alimentam a etapa 1 (exemplos de onde está a alteração).

## Agente de imagens v1 (foco escolhido pelo usuário em 26/11/2026)

Só as imagens: identificar o que cada foto mostra e onde está a alteração. O texto do laudo continua como hoje.

- **Onde roda**: dentro da API (`Servicos/Ia/AgenteImagens.cs`), na mesma fila; chama a IA paga diretamente.
- **Modelo**: Gemini Flash (barato), configurável (`GEMINI_MODELO_IMAGENS`). O Claude (reserva) não faz marcações.
- **Para cada foto devolve**: órgão (nomes de `ModeloLaudo.OrgaosAbdominal` ou "indefinido"), confiança, texto escrito
  na foto pelo operador (a própria IA lê), normal/alterado, achado curto, caixa da alteração (0–1000), se serve para a prancha.
- **Grava** numa tabela nova `analises_imagem` (exame, foto, hash, resultado, modelo, custo).
- **Ferramentas**: v1 sem ferramentas (um pedido por lote de fotos, com aprendizados de órgãos confundidos);
  v2 com `casos_parecidos` (pgvector no PostgreSQL).
- **Modo** (`IA_AGENTE_IMAGENS`): `desligado` | `comparar` (roda ao lado, não muda o laudo, só mede) | `ativo`
  (o pré-laudo recebe a triagem e só as fotos relevantes vão ao modelo caro; revisão mostra órgão e marcações).
- **Medição**: acerto por foto comparado com os rótulos do veterinário; exige **rótulos automáticos ao assinar** (etapa 1).
- **Tela**: "IA (sistema)" ganha acerto e custo do agente × modo atual.

## Atlas de referência (alternativa menor, proposta pelo usuário em 26/11/2026)

Biblioteca curada de imagens de referência (cão e gato): órgãos normais e achados (cisto, cálculo, lama biliar...),
com espécie, órgão, achado, descrição e medidas de referência. Sem treinar modelo.

- **Cadastro**: tela do administrador do sistema para enviar e etiquetar as imagens do atlas (tabela `atlas_imagens`,
  arquivos numa pasta própria). Medidas normais alimentam a tabela de referências que já existe.
- **Uso — verificação com o atlas**: depois do pré-laudo atual, para cada órgão alterado, alerta ou dúvida, um pedido
  curto à IA com a foto do exame + 2–3 imagens do atlas do achado suspeito + 1 do órgão normal: "confirma, descarta ou é
  outro achado?". Só roda quando há achado, então o custo extra é pequeno.
- **Revisão**: mostra "comparado com o atlas: cálculo vesical" com as imagens de referência usadas.
- **Direitos de uso**: imagens de atlas publicados têm direitos autorais; usar só imagens próprias, licenciadas
  ou de licença aberta que permita uso comercial.

## Pendente de decisão do usuário
- Começar pela etapa 1? Marcações na tela e no PDF, ou só na tela?
