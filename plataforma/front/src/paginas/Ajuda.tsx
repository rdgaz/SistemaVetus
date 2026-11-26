import { useState, type ReactNode } from 'react';
import { BotaoSuporte, PRODUTO, textoVersao } from '../marca';
import { useSessao } from '../sessao';
import { Cartao, Titulo } from '../ui';

type Topico = { id: string; titulo: string; palavras: string; conteudo: ReactNode };

/** Manual do que o AutoLaudoVet já faz, escrito para as clínicas. */
const TOPICOS: Topico[] = [
  {
    id: 'primeiro-acesso', titulo: '1. Primeiro acesso, senha e menu da conta', palavras: 'login entrar senha provisória trocar celular menu conta iniciais clínica',
    conteudo: (
      <>
        <p>Você recebe do administrador da clínica um <b>e-mail</b> e uma <b>senha provisória</b>. No primeiro acesso, o sistema pede para criar a sua senha (mínimo de 8 caracteres).</p>
        <ul>
          <li>No topo ficam os lugares de trabalho: <b>Exames</b>, <b>Mentoria</b> e, para o administrador, <b>Clínica</b>. No celular, eles ficam no botão ☰.</li>
          <li>O círculo com as <b>suas iniciais</b> abre o menu da conta: <b>Minha conta</b>, <b>Ajuda</b> e <b>Sair</b>.</li>
          <li>Para trocar a senha depois: <b>Minha conta → Senha</b>.</li>
          <li>No celular, atenção à primeira letra maiúscula automática do teclado: a senha diferencia maiúsculas de minúsculas.</li>
          <li>O sistema funciona no navegador do computador e do celular; no celular, use "Adicionar à tela inicial" para abrir como um app.</li>
          <li>Quem atende mais de uma clínica escolhe a clínica no topo da tela.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ultrassom', titulo: '2. Configurar o ultrassom (DICOM)', palavras: 'aparelho mindray dicom ae title porta ip storage enviar',
    conteudo: (
      <>
        <p>No ultrassom, em <b>DICOM → Storage</b>, cadastre o servidor do {PRODUTO.nome} com:</p>
        <ul>
          <li><b>Endereço IP:</b> o do servidor (a clínica recebe essa informação na instalação).</li>
          <li><b>Porta:</b> 2345.</li>
          <li><b>Título AE:</b> o da sua clínica, mostrado na tela <b>Exames</b> ("Configurar o ultrassom") e nas configurações da clínica.</li>
        </ul>
        <p>Use o botão de teste de conexão do aparelho (C-ECHO) para conferir. Depois, é só enviar o exame pelo aparelho: ele aparece na lista de Exames em alguns segundos.</p>
      </>
    ),
  },
  {
    id: 'exames', titulo: '3. Lista de exames e status', palavras: 'lista status fila pendente gerando revisão assinado pronto mentor erro urgente buscar abd rep smp abdominal saldo',
    conteudo: (
      <>
        <p>Os exames aparecem por ordem de chegada, com abas por status (o número ao lado mostra quantos há em cada uma):</p>
        <ul>
          <li><b>Aguardando dados:</b> falta alguém completar os dados e tocar em "Gerar pré-laudo" (clínica no modo manual ou com informações adicionais obrigatórias).</li>
          <li><b>Na fila:</b> esperando a vez da IA (urgentes passam na frente).</li>
          <li><b>Gerando:</b> a IA está analisando as imagens.</li>
          <li><b>Aguardando revisão:</b> o pré-laudo está pronto para o veterinário revisar.</li>
          <li><b>Assinado:</b> laudo aprovado e assinado, pode ser enviado.</li>
          <li><b>Erro:</b> a geração falhou (o motivo aparece no exame); toque em "Gerar de novo".</li>
        </ul>
        <p>Quando o laudo está em revisão com o mentor, o exame exibe o selo <b>🎓 Com o mentor</b>. Use a <b>busca</b> para achar por paciente, responsável, espécie, tipo ou data. O tipo aparece abreviado: <b>ABD</b> (abdominal), <b>REP</b> (reprodução) e <b>SMP</b> (partes pequenas). A lista se atualiza sozinha e mostra o <b>saldo para pré-laudos</b> no topo.</p>
      </>
    ),
  },
  {
    id: 'pendrive', titulo: '4. Enviar exame pelo pendrive ou pelo celular', palavras: 'pendrive usb pasta enviar exame vídeo mp4 pdf jpg jpeg aparelho exportar celular fotos soltas',
    conteudo: (
      <>
        <p>Use quando o aparelho não enviou o exame por DICOM, para ter as fotos em melhor qualidade e os vídeos, ou para mandar fotos do celular.</p>
        <p><b>No computador</b> (Exames → <b>+ Enviar exame</b>):</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>No ultrassom, exporte o exame para o pendrive. Ele cria uma pasta por animal (ex.: <b>JADE20261105-083824-3E0C</b>).</li>
          <li>Toque em <b>Escolher pasta</b> e escolha a pasta do animal (ou o pendrive inteiro, com vários exames), ou em <b>Escolher arquivos soltos</b> para selecionar fotos e PDF.</li>
          <li>Confira a lista: o sistema lê o relatório PDF do aparelho e preenche paciente, responsável, idade, medidas e comentários. Se faltar o nome do animal, digite.</li>
          <li>Marque <b>Enviar também os vídeos</b> se quiser guardá-los no exame (eles não vão para a IA). Toque em <b>Enviar</b>.</li>
        </ol>
        <p><b>No celular:</b> toque em <b>Escolher fotos e arquivos</b> e selecione de uma vez as fotos (.jpg/.jpeg), o relatório (.pdf) e os vídeos (.mp4). Informe o nome do animal e o tipo do exame.</p>
        <p>Se a internet cair, envie de novo: continua de onde parou. Se o mesmo exame já veio pelo DICOM, os dois são juntados (sem duplicar); as fotos do pendrive só substituem as do DICOM antes do primeiro pré-laudo.</p>
      </>
    ),
  },
  {
    id: 'exame', titulo: '5. Tela do exame: dados e informações adicionais', palavras: 'paciente responsável raça peso castrado jejum suspeita solicitante texto livre ditar obrigatório relatório',
    conteudo: (
      <>
        <ul>
          <li><b>Fotos:</b> role para o lado ou toque em "Ver todas"; um toque amplia e as setas passam para a próxima.</li>
          <li><b>Dados do paciente e do exame:</b> corrija o que foi digitado no aparelho (nome, espécie, raça, sexo, castrado, idade, peso), o responsável (nome, WhatsApp, e-mail) e o exame (tipo, jejum, suspeita, clínica e veterinário solicitante com CRMV, histórico).</li>
          <li><b>Informações adicionais:</b> escreva ou dite (microfone do teclado) o que souber: suspeita, histórico, o que o responsável relatou. A IA organiza esse texto nos campos vazios e o usa na análise. A clínica pode tornar esse campo <b>obrigatório</b>.</li>
          <li><b>Relatórios do aparelho (PDF):</b> os relatórios que vieram do pendrive ficam no exame para consulta.</li>
          <li><b>Marcar urgente:</b> o exame passa na frente na fila.</li>
          <li>Para gerar o pré-laudo bastam <b>espécie</b> e <b>tipo de exame</b>; os demais campos aparecem como recomendados.</li>
          <li>Se sair com alterações não salvas, o sistema avisa.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ia', titulo: '6. Pré-laudo com IA e alertas', palavras: 'ia gerar atualizar refazer análise completa nova análise fotos repetidas alerta urgente atenção',
    conteudo: (
      <>
        <p>A IA analisa as fotos do exame (sem repetir fotos iguais, priorizando as que têm medidas ou anotações do operador), os dados do paciente, as medidas do aparelho e os <b>valores de referência</b> da espécie e do peso. Ela escreve o pré-laudo no padrão brasileiro: condições técnicas, cada órgão (normal, alterado ou não visibilizado), impressão diagnóstica, diferenciais, recomendações e as fotos de cada órgão.</p>
        <ul>
          <li><b>Pedir nova análise à IA</b> (link na tela do exame, mostrando o <b>custo estimado</b> de cada opção):
            <ul className="list-disc pl-5">
              <li><b>Atualizar com o que mudou:</b> depois de mudar dados ou as informações adicionais, a IA ajusta o texto <b>sem olhar as fotos de novo</b> e mantendo as suas edições (mais rápido e mais barato). Se chegaram fotos novas, só elas são analisadas.</li>
              <li><b>Refazer análise completa:</b> a IA olha todas as fotos de novo e escreve o pré-laudo outra vez (custo médio de um pré-laudo novo).</li>
            </ul>
          </li>
          <li>Se nada mudou, o sistema avisa e não cobra.</li>
          <li><b>Alerta:</b> quando a IA vê algo que pede atenção imediata, o pré-laudo mostra um aviso em vermelho (ou amarelo, se a confiança for média ou baixa), com o que ela viu e as fotos. Se discordar, toque em <b>Discordo deste alerta</b> e diga o motivo.</li>
          <li>A IA não inventa órgão que não aparece nas fotos: ele fica como "não visibilizado", com o motivo.</li>
          <li>O pré-laudo é um <b>rascunho</b>: só vale depois da revisão e da assinatura do veterinário.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'referencias', titulo: '7. Medidas e valores de referência', palavras: 'medidas referência acima abaixo faixa normal rim parede',
    conteudo: (
      <>
        <p>Na tela do exame, o quadro <b>Medidas do aparelho × referência</b> mostra cada medida ao lado da faixa normal para a espécie e o peso do paciente, com destaque <b>▲ Acima</b> ou <b>▼ Abaixo</b>. Abaixo dele, "Valores de referência" lista todas as referências do paciente (passe o mouse para ver a fonte).</p>
        <p>Preencha o <b>peso</b> do paciente: algumas referências mudam conforme o porte.</p>
      </>
    ),
  },
  {
    id: 'revisao', titulo: '8. Revisão do laudo', palavras: 'revisar normal alterado não visibilizado frase pronta laudo fácil ditado voz falar padronizar detalhes documento diferenciais salvar',
    conteudo: (
      <>
        <ul>
          <li>Em cada órgão, escolha <b>Normal</b> (aplica a frase padrão de normalidade), <b>Alterado</b> ou <b>Não visibilizado</b>, e edite o texto.</li>
          <li><b>Frase pronta…:</b> escolha uma frase do banco de frases para o órgão; ela preenche a descrição e a impressão diagnóstica.</li>
          <li><b>Mais detalhes</b> (em cada órgão): a descrição, as imagens que a IA usou para o órgão e o <b>ditado por voz</b>. Toque em <b>🎤 Falar</b>, diga do seu jeito o que quer registrar e toque em <b>Padronizar texto</b>: a IA reescreve no padrão do laudo, sem acrescentar nada. Confira e toque em <b>Usar no laudo</b>. Cada padronização usa uma pequena parte do saldo; o áudio não é guardado.</li>
          <li>Edite condições técnicas, impressão, diferenciais e recomendações (um por linha). Os <b>diagnósticos diferenciais</b> podem ser ocultados do laudo com a chave "Exibir no laudo".</li>
          <li><b>Duas visões do mesmo laudo</b>, na chave do topo da revisão: <b>☰ Por órgão</b> (cartões com as ferramentas de cada órgão) e <b>📄 Como vai ficar</b> (o laudo com a cara do PDF, editável direto no texto; ao tocar num órgão aparecem as mesmas ferramentas em cima dele). Trocar de visão não perde nada; o Salvar e o Aprovar e assinar são os mesmos.</li>
          <li><b>Salvar:</b> um botão só guarda o texto do laudo e os dados do exame.</li>
          <li><b>Prévia do PDF</b> mostra como vai ficar (marcado "RASCUNHO").</li>
        </ul>
      </>
    ),
  },
  {
    id: 'prancha', titulo: '9. Prancha de fotos (as fotos que vão no PDF)', palavras: 'prancha fotos escolher imagens laudo pdf ordem órgãos anotações',
    conteudo: (
      <>
        <ul>
          <li>A prancha reúne <b>as fotos que saem no PDF</b> do laudo. Toque em <b>Escolher fotos</b> para montar: não há limite de fotos.</li>
          <li>O sistema já sugere <b>todas as fotos associadas aos órgãos</b>, na ordem dos órgãos do laudo, e depois as que a IA destacou.</li>
          <li>Toque em uma foto para incluir ou tirar; <b>Concluir escolha</b> guarda a seleção. No modo documento, use "Tirar da prancha".</li>
          <li>O número de fotos por linha, o fundo da prancha e a exibição das anotações manuais são escolhidos na <b>Aparência do PDF</b>.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'aprendizado', titulo: '10. Como a IA aprende com a sua revisão', palavras: 'aprender treinar ia corrigir órgão imagem confirmar discordar alerta estilo',
    conteudo: (
      <>
        <p>As suas correções deixam os próximos pré-laudos mais certos:</p>
        <ul>
          <li><b>Imagens do órgão:</b> em "Mais detalhes", toque em <b>É este órgão</b> ou <b>Não é este órgão</b> (e escolha o certo). Em "Ver as outras imagens do exame", marque as que mostram o órgão. A IA passa a evitar a mesma confusão.</li>
          <li><b>Discordo deste alerta:</b> diga se foi falso alarme, achado diferente ou se as imagens não permitem concluir. Alertas assim passam a ser evitados.</li>
          <li><b>Ditado padronizado:</b> o texto que você usa ensina a IA a escrever no estilo da sua clínica.</li>
        </ul>
        <p>Os dados dos pacientes não são compartilhados: só as correções, de forma resumida, ajudam a melhorar a IA.</p>
      </>
    ),
  },
  {
    id: 'assinatura', titulo: '11. Aprovar e assinar', palavras: 'assinar crmv aprovar uf assinatura digitalizada veterinário',
    conteudo: (
      <>
        <ul>
          <li><b>Aprovar e assinar</b> fica na barra da revisão. Antes de assinar, o sistema pede para você confirmar que conferiu tudo com as imagens.</li>
          <li>Só pode assinar o <b>veterinário</b> com <b>CRMV e UF</b> cadastrados em <b>Minha conta → Dados profissionais</b>.</li>
          <li>Em <b>Minha conta</b> você também envia a <b>imagem da sua assinatura</b>, que sai no PDF.</li>
          <li>Depois de assinado, o laudo não pode mais ser editado (veja Retificar).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'pdf', titulo: '12. PDF, verificação e retificação', palavras: 'pdf qr code verificação autenticidade retificar corrigir visualizar imprimir',
    conteudo: (
      <>
        <ul>
          <li><b>Visualizar Laudo em PDF</b> abre o laudo assinado em outra aba, para ver ou imprimir. O arquivo sai com o nome do paciente.</li>
          <li>O PDF traz o logo e os dados da clínica, a identificação do paciente, os achados, a impressão, a assinatura e a prancha de fotos.</li>
          <li>No rodapé pode haver um <b>código de verificação</b> e um <b>QR code</b>: quem receber o laudo confirma a autenticidade sem precisar de login (a clínica liga ou desliga nas configurações).</li>
          <li><b>Retificar</b> (veterinário ou administrador): para corrigir um laudo assinado, informe o motivo; a versão anterior fica marcada como retificada e uma nova versão abre para revisar e assinar.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'envio', titulo: '13. Enviar o laudo (WhatsApp, e-mail, link)', palavras: 'compartilhar whatsapp email link pdf responsável tutor smtp gmail senha de app revogar',
    conteudo: (
      <>
        <p>No laudo assinado, use <b>Compartilhar</b>:</p>
        <ul>
          <li><b>WhatsApp:</b> abre a conversa com a mensagem e o link do laudo (telefone do responsável já preenchido; em branco, você escolhe o contato).</li>
          <li><b>E-mail:</b> envia o PDF anexado pelo <b>seu próprio e-mail</b>. Configure em Minha conta → Envio de laudos → "E-mail (SMTP próprio)". Em Gmail e Outlook, use uma <b>senha de app</b>; teste com "Enviar teste".</li>
          <li><b>Copiar link / Baixar PDF.</b></li>
          <li><b>Compartilhar por app:</b> manda o arquivo PDF pelos aplicativos do aparelho. Só aparece quando o acesso é seguro (endereço com <b>https</b>).</li>
          <li>O link do responsável abre o laudo sem login, vale por um prazo (padrão 30 dias) e pode ser <b>revogado</b> em "Links ativos".</li>
          <li>Em Minha conta você escolhe quais opções aparecem no Compartilhar e a validade dos links.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'creditos', titulo: '14. Saldo para pré-laudos', palavras: 'saldo créditos recarga extrato cobrança custo estimado',
    conteudo: (
      <>
        <p>Cada pré-laudo gerado pela IA usa o <b>saldo</b> da clínica, de acordo com o tamanho do exame. Atualizações sem fotos e padronizações de ditado custam menos; <b>erro e "nada mudou" não descontam do saldo</b>.</p>
        <ul>
          <li>O saldo, a média por pré-laudo e a estimativa de quantos pré-laudos ele rende aparecem na tela <b>Exames</b>; com saldo baixo, aparece um aviso.</li>
          <li>O administrador da clínica vê o <b>extrato</b> nas configurações da clínica, e cada pré-laudo mostra o valor usado.</li>
          <li>Sem saldo, o pré-laudo não é gerado. Para recarregar, fale com o suporte.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'excluir', titulo: '15. Excluir um exame', palavras: 'excluir apagar exame remover',
    conteudo: (
      <>
        <p>O botão <b>Excluir exame</b> fica no fim da tela do exame. Ele apaga o exame por completo: pré-laudos, laudos e os arquivos enviados pelo pendrive. <b>Não tem volta.</b></p>
        <ul>
          <li>O veterinário pode excluir exames ainda sem laudo assinado; exame com laudo assinado, só o <b>administrador da clínica</b>.</li>
          <li>Não dá para excluir enquanto a IA está gerando.</li>
          <li>Toda exclusão fica guardada nos Registros de atividade (quem excluiu, quando e o que havia).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin-clinica', titulo: '16. Administração da clínica', palavras: 'usuários perfis veterinário administrador logo dados clínica automático manual aparência pdf cores registros atividade obrigatório qr',
    conteudo: (
      <>
        <p>Para o <b>administrador da clínica</b>, em <b>Clínica</b> (no topo), nas abas:</p>
        <ul>
          <li><b>Dados e Funcionamento:</b> dados do cabeçalho do laudo e <b>logo</b>; se o pré-laudo é gerado <b>automaticamente</b> ao receber o exame; se as <b>informações adicionais</b> são obrigatórias; e se o laudo mostra o <b>QR code</b> de verificação.</li>
          <li><b>Aparência do PDF:</b> cores, estilo dos títulos (faixa com fundo, caixa com borda ou texto colorido), cabeçalho, ordem e visibilidade das seções, fotos por linha e exibição de anotações na prancha, posição da assinatura e do QR, texto justificado, rodapé e aviso final. "Voltar ao padrão" desfaz as personalizações.</li>
          <li><b>Usuários:</b> adicione pessoas (com senha provisória), escolha o perfil (<b>Recepção</b>: cadastra e envia exames; <b>Veterinário</b>: revisa e assina; <b>Administrador</b>: tudo, inclusive as configurações) e desative quem saiu. Ultrassonografistas que atendem outras clínicas usam o mesmo e-mail e senha.</li>
          <li><b>Registros de atividade:</b> quem fez o quê e quando (exame enviado, análise pedida à IA, laudo assinado e retificado, alerta discordado, exame excluído, usuários, configurações, saldo), com filtro por tipo, data e busca.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mentoria', titulo: '17. Mentoria e avisos', palavras: 'mentor mentoria mentorado professor revisão orientação avisos sino notificação',
    conteudo: (
      <>
        <p>Na <b>Mentoria</b> (no topo da tela), você encontra veterinários experientes, escolhidos pela equipe do {PRODUTO.nome}, para orientar o seu trabalho.</p>
        <ul>
          <li><b>Encontrar um mentor:</b> busque por nome, área (ex.: abdominal, felinos) ou instituição, toque em <b>Pedir mentoria</b> e conte um pouco sobre você.</li>
          <li>O mentor <b>aceita ou recusa</b>; você recebe o aviso no sino. Enquanto ele não responde, dá para <b>cancelar o pedido</b>.</li>
          <li>Qualquer um dos dois pode <b>encerrar a mentoria</b> quando quiser.</li>
          <li><b>Enviar ao mentor:</b> na tela do exame, toque em <b>Enviar ao mentor para revisão</b> e escreva uma mensagem (ex.: "Fiquei em dúvida no baço"). Até o mentor responder, o laudo fica parado (sem editar nem assinar); dá para cancelar a qualquer momento (se o mentor já começou, o que ele fez é descartado e ele é avisado).</li>
          <li>Quando o mentor termina, você recebe o aviso e o exame mostra <b>"Laudo confirmado pelo mentor"</b> ou <b>"Revisado pelo mentor, com sugestões"</b>, com o parecer, os comentários por órgão e o link para ver o que ele mudou.</li>
          <li>Laudo já assinado também pode ir ao mentor, <b>para ensino</b>: o laudo assinado não muda.</li>
          <li><b>Se você é mentor:</b> em <b>Mentoria → Pedidos de revisão</b> estão (o número ao lado de Mentoria, no topo, mostra quantos esperam você) os laudos enviados a você. Confira o texto, a situação de cada órgão e o órgão de cada foto, comente, escreva o parecer e toque em <b>Confirmar sem alterações</b> ou <b>Concluir revisão</b>. Na tela Mentoria, responda os pedidos de mentoria, veja seus mentorados e preencha o seu perfil (áreas, instituição, mini currículo, se aceita novos mentorados e se permite "Revisado por" no laudo).</li>
          <li><b>Sino (avisos):</b> no topo da tela, mostra os avisos novos; tocar em um aviso leva à tela certa.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'anotacoes', titulo: '18. Anotar texto e medidas nas imagens', palavras: 'anotar imagem foto medida régua calibrar escala caixa canto arrastar texto órgão mover cursor amarelo prancha manual',
    conteudo: (
      <>
        <p>Esqueceu de identificar um órgão ou de registrar uma medida no aparelho? Antes de assinar o laudo (ou ao retificá-lo), você pode anotar qualquer foto no mesmo padrão visual do ultrassom, sem alterar o arquivo original:</p>
        <ul>
          <li>Abra a foto em tela cheia e toque em <b>✎ Anotar</b> (ou no botão <b>✎</b> da miniatura do órgão na revisão).</li>
          <li><b>Medida (2 pontos) com sugestão pela régua:</b> toque no 1º e no 2º ponto da estrutura (cursores amarelos <b>+</b> e <b>×</b> com linha pontilhada). Quando o sistema reconhece a <b>régua lateral</b> da foto — ou quando já há outra medida na imagem ou calibração salva —, o valor em <b>cm</b> já vem <b>sugerido</b>; confira com o aparelho, ajuste o rótulo/órgão e marque se quiser inserir a medida direto na descrição do órgão.</li>
          <li><b>📐 Calibrar (quando não há régua automática):</b> se o sistema não encontrar a régua sozinho, toque em <b>📐 Calibrar</b>, marque duas divisões da régua da imagem (ex.: 0 e 1 cm) e informe a distância. A escala fica salva para aquele aparelho e tamanho de foto em <b>toda a clínica</b>.</li>
          <li><b>Posição da caixa das medidas:</b> escolha um dos <b>4 cantos</b> (<b>↖ ↗ ↙ ↘</b>) em <b>Caixa</b> ou <b>arraste</b> o quadro ciano para onde não cubra a imagem (por padrão ele já desvia dos pontos medidos). Textos e pontos também podem ser arrastados, desfeitos (<b>↶ Desfazer</b>) ou limpos (<b>🗑 Limpar</b>).</li>
          <li><b>Texto e órgão coerente com o laudo:</b> em <b>Texto</b>, escolha uma sugestão (ex.: <i>BAÇO</i>, <i>RIM E</i>, <i>VB</i>) ou digite e toque na foto para posicionar em letras brancas maiúsculas. Ao escrever o nome de um órgão na foto ou escolhê-lo na medida, o sistema pergunta ao salvar se deseja <b>mover a foto para esse órgão</b> no laudo (atualizando também o aprendizado da IA).</li>
          <li>As anotações aparecem na tela (com botão <b>Anotações</b> para mostrar/ocultar), saem na <b>prancha do PDF</b> (configurável em <b>Aparência do PDF</b>), entram em <b>Medidas do aparelho × referência</b> e vão para a IA em novas análises.</li>
        </ul>
      </>
    ),
  },
];

/** Ajuda (só para quem acessa uma clínica): suporte pelo WhatsApp, manual e versão. */
export function Ajuda() {
  const { clinica } = useSessao();
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const visiveis = TOPICOS.filter((t) => !termo || `${t.titulo} ${t.palavras}`.toLowerCase().includes(termo));

  return (
    <>
      <Titulo>Ajuda</Titulo>
      <div className="space-y-4">
        <Cartao>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-800">Precisa de ajuda?</div>
              <div className="text-sm text-slate-600">Fale com o suporte da Moderno Tech pelo WhatsApp. Informe a clínica ({clinica?.nome}) e o que aconteceu.</div>
            </div>
            <BotaoSuporte assunto={clinica ? `clínica ${clinica.nome}` : undefined} />
          </div>
        </Cartao>

        <Cartao titulo="Manual">
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no manual (ex.: assinar, WhatsApp, saldo)"
            className="mb-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-[#0E4D64]" />
          <div className="divide-y divide-slate-100">
            {visiveis.map((t) => (
              <details key={t.id} className="group py-1" open={!!termo}>
                <summary className="cursor-pointer list-none py-2 font-medium text-[#0E4D64]">
                  <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>{t.titulo}
                </summary>
                <div className="manual space-y-2 pb-3 pl-5 text-sm text-slate-700">{t.conteudo}</div>
              </details>
            ))}
            {visiveis.length === 0 && <p className="py-3 text-sm text-slate-500">Nada encontrado. Tente outra palavra ou fale com o suporte.</p>}
          </div>
        </Cartao>

        <p className="text-center text-xs text-slate-500">{PRODUTO.nome} {textoVersao()}</p>
      </div>
    </>
  );
}
