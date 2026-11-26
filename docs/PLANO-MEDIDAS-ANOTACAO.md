# Plano: sugestão de medida, posição da caixa e órgão no editor de imagens

Proposta de 26/11/2026, **decisões tomadas** (fim do documento). Em implementação, começando pelo teste da régua.
O editor de anotações foi feito pelo Antigravity (`paginas/EditorAnotacao.tsx`, `Servicos/DesenhoAnotacao.cs`,
`Endpoints/AnotacaoEndpoints.cs`); combinar no quadro de coordenação antes de mexer.

## Como é hoje

- As anotações ficam em `anotacoes_imagem` (um JSON por foto). A foto original nunca muda: o desenho é feito por cima, na tela
  (`CamadaAnotacao`) e no PDF (`DesenhoAnotacao`, SkiaSharp).
- Medida = 2 pontos (coordenadas de 0 a 1 sobre a foto) + **valor digitado em cm** + rótulo + órgão (opcional).
- A caixa das medidas (borda ciano, estilo Mindray) fica **fixa no canto inferior direito**, na tela e no PDF.
- Órgão escolhido no editor: marca a medida/texto, pode inserir o trecho na descrição do órgão e, **só se a foto ainda não tinha
  rótulo**, grava "esta foto é X" para o aprendizado. Não move a foto para o órgão no laudo e não atualiza um rótulo já existente.

## 1. Sugestão de medida (sem IA)

A ideia é saber **quantos pixels valem 1 cm** naquela foto; a distância entre os 2 pontos vira centímetros.
A sugestão aparece **já preenchida e editável** ("Sugerido: 0,57 cm — pela régua") e o veterinário sempre confirma
(regra do projeto: nunca inventar medida). Sem escala confiável, o campo fica vazio como hoje.

Fontes da escala, em ordem:

1. **Régua de profundidade da própria foto** (automático): o aparelho desenha na lateral da imagem uma escala com marcas a cada
   1 cm (às vezes 0,5 cm). Análise simples de pixels, sem IA:
   - procurar, nas faixas laterais, uma coluna com pequenos traços claros repetidos em intervalos iguais;
   - medir o intervalo mais frequente entre os traços (em pixels) = 1 cm (ou 0,5 cm, conferido pelos números da escala quando
     houver mais de um intervalo possível);
   - aceitar só se houver pelo menos 4 traços alinhados e regulares (senão, não sugere).
   Feito no navegador (canvas), na hora de abrir o editor, sem custo.
2. **Calibração por toque** (reserva): botão "Calibrar" → o veterinário toca em duas marcas da régua e informa a distância
   ("1 cm"). A escala fica guardada para o **mesmo aparelho + mesmo tamanho de imagem + mesma profundidade** (quando a
   profundidade aparece na foto) e vale para as próximas fotos parecidas.
3. **Aprendizado com as medidas digitadas**: cada medida confirmada registra a escala daquela foto (pixels ÷ cm). Fotos do mesmo
   exame com o mesmo tamanho e a mesma profundidade usam essa escala como sugestão.

Mostrar sempre **de onde veio** a sugestão (régua, calibração, outra medida do exame) e, na dúvida, não sugerir.

**Exames do DICOM**: a escala exata estaria no arquivo original (`PixelSpacing` / regiões de ultrassom), mas o receptor apaga o
`.dcm` depois de converter e o receptor é outro projeto. Fica para depois (pedir ao projeto do receptor para guardar a escala no
`medidas.json`).

**Dados novos**: tabela `calibracoes_imagem` (clínica, equipamento, largura × altura da foto, profundidade quando houver,
pixels por cm, origem: régua/toque/medida, quem e quando).

## 2. Posição da caixa das medidas

- No editor: botão **"Posição da caixa"** com os 4 cantos (↖ ↗ ↙ ↘) e a opção de **arrastar** a caixa para qualquer lugar.
- Guardado por foto (campo `quadro` no JSON da anotação: canto ou x/y de 0 a 1). Fotos antigas continuam no canto inferior
  direito.
- Vale na tela (`CamadaAnotacao`) e no PDF (`DesenhoAnotacao.cs`, cálculo do retângulo do quadro).
- Sugestão automática: ao abrir, se o canto inferior direito cobre uma das medidas, sugerir o canto livre mais próximo.

## 3. Órgão no editor coerente com o laudo

- Ao salvar com um órgão diferente do órgão em que a foto está no laudo: perguntar **"Mover esta foto para Baço?"**
  (Sim → a foto entra nas miniaturas desse órgão e sai do anterior; Não → só a anotação guarda o órgão).
- O rótulo de aprendizado passa a acompanhar a última escolha: se já existia rótulo e o órgão mudou, grava como **correção**
  (hoje só o primeiro rótulo vale).
- A prancha continua como está (o veterinário decide a prancha).

## Etapas sugeridas

0. **Teste de viabilidade da régua** (1 dia): rodar a detecção em 20–30 fotos reais de exames já assinados (sem sair do servidor,
   sem guardar nada) e medir em quantas a régua é achada e com que erro. Se acertar bem, segue; se não, a calibração por toque
   vira o caminho principal.
1. Posição da caixa (cantos + arrastar), na tela e no PDF.
2. Órgão coerente (mover a foto e atualizar o rótulo).
3. Sugestão de medida: régua automática + calibração por toque + aprendizado.
4. Depois: escala exata do DICOM (depende do projeto do receptor).

## Verificação

- Testes de ponta a ponta (`tests/anotacoes.js`): posição da caixa salva e devolvida; PDF gerado com a caixa em cada canto;
  mover a foto atualiza `orgaos[].imagens` e o rótulo vira correção; calibração gravada e usada na foto seguinte.
- Detecção da régua: teste com imagens sintéticas (régua desenhada com espaçamento conhecido) para conferir o cálculo.
- Conferência visual no editor (computador e celular) e no PDF.

## Pendente de decisão do usuário

1. ~~Fotos reais no teste da régua~~ — **decidido em 26/11/2026: sim**, 20–30 fotos de exames assinados, processadas só no
   servidor, nada guardado.
2. ~~Alcance da calibração~~ — **decidido em 26/11/2026: clínica inteira**.
3. ~~Mover a foto~~ — **decidido em 26/11/2026: perguntar sempre**.
4. ~~Ordem~~ — **decidido em 26/11/2026**: teste da régua, depois posição da caixa, órgão coerente e sugestão de medida.
