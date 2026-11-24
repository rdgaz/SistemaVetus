import { useState, type ReactNode } from 'react';
import { BotaoSuporte, PRODUTO, textoVersao } from '../marca';
import { useSessao } from '../sessao';
import { Cartao, Titulo } from '../ui';

type Topico = { id: string; titulo: string; palavras: string; conteudo: ReactNode };

/** Manual do que o AutoLaudoVet já faz, escrito para as clínicas. */
const TOPICOS: Topico[] = [
  {
    id: 'primeiro-acesso', titulo: '1. Primeiro acesso e senha', palavras: 'login entrar senha provisória trocar celular',
    conteudo: (
      <>
        <p>Você recebe do administrador da clínica um <b>e-mail</b> e uma <b>senha provisória</b>. No primeiro acesso, o sistema pede para criar a sua senha (mínimo de 8 caracteres).</p>
        <ul>
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
          <li><b>Título AE:</b> o da sua clínica, mostrado na tela <b>Exames</b> enquanto não houver exames e em <b>Clínica</b>.</li>
        </ul>
        <p>Use o botão de teste de conexão do aparelho (C-ECHO) para conferir. Depois, é só enviar o exame pelo aparelho: ele aparece na lista de Exames em alguns segundos.</p>
      </>
    ),
  },
  {
    id: 'exames', titulo: '3. Lista de exames e status', palavras: 'lista status fila pendente gerando revisão pronto erro urgente',
    conteudo: (
      <>
        <p>Os exames aparecem por ordem de chegada, com abas por status:</p>
        <ul>
          <li><b>Aguardando dados:</b> a clínica está no modo manual; complete os dados e toque em "Gerar pré-laudo".</li>
          <li><b>Na fila:</b> esperando a vez da IA (urgentes passam na frente).</li>
          <li><b>Gerando:</b> a IA está analisando as imagens.</li>
          <li><b>Aguardando revisão:</b> o pré-laudo está pronto para o veterinário revisar.</li>
          <li><b>Pronto:</b> laudo aprovado e assinado, pode ser enviado.</li>
          <li><b>Erro:</b> a geração falhou (o motivo aparece no exame); toque em "Gerar de novo".</li>
        </ul>
        <p>A lista se atualiza sozinha. No topo aparece o <b>saldo de créditos</b> para pré-laudos.</p>
      </>
    ),
  },
  {
    id: 'exame', titulo: '4. Tela do exame: dados e informações adicionais', palavras: 'paciente responsável raça peso castrado jejum suspeita solicitante texto livre ditar',
    conteudo: (
      <>
        <ul>
          <li><b>Fotos:</b> role para o lado ou toque em "Ver todas"; um toque amplia.</li>
          <li><b>✎ Editar:</b> corrija o que foi digitado no aparelho (nome, espécie, raça, sexo, castrado, idade, peso), o responsável (nome, WhatsApp, e-mail) e o exame (tipo, jejum, suspeita, solicitante com CRMV, histórico). Toque em <b>Salvar</b>.</li>
          <li><b>Informações adicionais:</b> escreva ou dite (microfone do teclado) o que souber: suspeita, histórico, o que o responsável relatou. A IA organiza esse texto nos campos vazios e o usa na análise.</li>
          <li><b>Marcar urgente:</b> o exame passa na frente na fila.</li>
          <li>Para gerar o pré-laudo bastam <b>espécie</b> e <b>tipo de exame</b>; os demais campos aparecem como recomendados.</li>
          <li>Se sair com alterações não salvas, o sistema avisa.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ia', titulo: '5. Pré-laudo com IA', palavras: 'ia gerar atualizar refazer análise completa fotos repetidas referência medidas',
    conteudo: (
      <>
        <p>A IA analisa as fotos do exame (até 15, sem repetir fotos iguais), os dados do paciente, as medidas do aparelho e os <b>valores de referência</b> da espécie e do peso, e escreve o pré-laudo no padrão brasileiro: condições técnicas, cada órgão (normal, alterado ou não visibilizado), impressão diagnóstica, diferenciais, recomendações e sugestão de fotos para a prancha.</p>
        <ul>
          <li><b>Atualizar pré-laudo:</b> depois de mudar dados ou o texto livre, a IA ajusta o pré-laudo <b>sem reanalisar as fotos</b> (mais rápido e mais barato). Se chegaram fotos novas, só elas são analisadas.</li>
          <li><b>Refazer análise completa:</b> a IA olha todas as fotos de novo.</li>
          <li>Se nada mudou, o sistema avisa e não cobra.</li>
          <li>A IA não inventa órgão que não aparece nas fotos: ele fica como "não visibilizado", com o motivo.</li>
          <li>O pré-laudo é um <b>rascunho</b>: só vale depois da revisão e da assinatura do veterinário.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'referencias', titulo: '6. Medidas e valores de referência', palavras: 'medidas referência acima abaixo faixa normal rim parede',
    conteudo: (
      <>
        <p>Na tela do exame, o quadro <b>Medidas do aparelho × referência</b> mostra cada medida ao lado da faixa normal para a espécie e o peso do paciente, com destaque <b>▲ Acima</b> ou <b>▼ Abaixo</b>. Abaixo dele, "Valores de referência" lista todas as referências do paciente (passe o mouse para ver a fonte).</p>
        <p>Preencha o <b>peso</b> do paciente: algumas referências mudam conforme o porte.</p>
      </>
    ),
  },
  {
    id: 'revisao', titulo: '7. Revisão e assinatura', palavras: 'revisar normal alterado prancha assinar crmv aprovar',
    conteudo: (
      <>
        <ul>
          <li>Em cada órgão, escolha <b>Normal</b> (aplica a frase padrão de normalidade), <b>Alterado</b> ou <b>Não visibilizado</b>, e edite o texto.</li>
          <li>Edite condições técnicas, impressão, diferenciais e recomendações (um por linha).</li>
          <li><b>Escolher fotos:</b> monte a prancha do laudo (até 12 fotos).</li>
          <li><b>Salvar revisão</b> guarda o rascunho; <b>Prévia do PDF</b> mostra como vai ficar (marcado "RASCUNHO").</li>
          <li><b>Aprovar e assinar:</b> só para veterinário com <b>CRMV e UF</b> cadastrados em Minha conta. Depois de assinado, o laudo não pode mais ser editado.</li>
          <li>Em <b>Minha conta</b> você pode enviar a <b>imagem da sua assinatura</b>, que sai no PDF.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'pdf', titulo: '8. PDF, verificação e retificação', palavras: 'pdf qr code verificação autenticidade retificar corrigir',
    conteudo: (
      <>
        <ul>
          <li>O PDF traz o logo e os dados da clínica, a identificação do paciente, os achados, a impressão, a assinatura e a prancha de fotos.</li>
          <li>No rodapé há um <b>código de verificação</b> e um <b>QR code</b>: quem receber o laudo confirma a autenticidade sem precisar de login.</li>
          <li><b>Retificar:</b> para corrigir um laudo assinado, informe o motivo; a versão anterior fica marcada como retificada e uma nova versão abre para revisar e assinar.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'envio', titulo: '9. Enviar o laudo (WhatsApp, e-mail, link)', palavras: 'compartilhar whatsapp email link pdf responsável tutor smtp gmail senha de app',
    conteudo: (
      <>
        <p>No laudo assinado, use <b>Compartilhar</b>:</p>
        <ul>
          <li><b>WhatsApp:</b> abre a conversa com a mensagem e o link do laudo (telefone do responsável já preenchido).</li>
          <li><b>E-mail:</b> envia o PDF anexado pelo <b>seu próprio e-mail</b>. Configure em Minha conta → Envio de laudos → "Seu e-mail de saída (SMTP)". Em Gmail e Outlook, use uma <b>senha de app</b>; teste com "Enviar teste".</li>
          <li><b>Copiar link / Baixar PDF;</b> no celular, "Enviar PDF" manda o arquivo pelo compartilhar do aparelho.</li>
          <li>O link do responsável abre o laudo sem login, vale por um prazo (padrão 30 dias) e pode ser <b>revogado</b>.</li>
          <li>Em Minha conta você escolhe quais opções aparecem no Compartilhar.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'creditos', titulo: '10. Créditos para pré-laudos', palavras: 'saldo créditos recarga extrato cobrança custo',
    conteudo: (
      <>
        <p>Cada pré-laudo gerado pela IA usa créditos da clínica, de acordo com o tamanho do exame. Atualizações sem fotos custam menos; <b>erro e "nada mudou" não cobram</b>.</p>
        <ul>
          <li>O saldo e a estimativa de quantos pré-laudos ele rende aparecem na tela <b>Exames</b>.</li>
          <li>O administrador da clínica vê o <b>extrato</b> em <b>Clínica</b>, e cada pré-laudo mostra o valor cobrado.</li>
          <li>Sem saldo, o pré-laudo não é gerado. Para recarregar, fale com o suporte.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'pendrive', titulo: '12. Enviar exame pelo pendrive', palavras: 'pendrive usb manual pasta enviar exame vídeo mp4 pdf aparelho exportar',
    conteudo: (
      <>
        <p>Use quando o aparelho não enviou o exame por DICOM, ou para ter as fotos em melhor qualidade e os vídeos.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>No ultrassom, exporte o exame para o pendrive. Ele cria uma pasta por animal (ex.: <b>JADE20261105-083824-3E0C</b>).</li>
          <li>No computador, abra <b>Exames → Enviar exame do pendrive</b> e escolha a pasta do animal (ou o pendrive inteiro, com vários exames).</li>
          <li>Confira a lista: o sistema lê o relatório PDF do aparelho e preenche paciente, responsável, idade, medidas e comentários. Se faltar o nome, digite.</li>
          <li>Marque <b>Enviar também os vídeos</b> se quiser guardá-los no exame (eles não vão para a IA). Clique em <b>Enviar</b>.</li>
        </ol>
        <p>Se a internet cair, envie de novo: o que já chegou não é reenviado. Se o mesmo exame já veio pelo DICOM, os dois são juntados (sem duplicar); as fotos do pendrive só substituem as do DICOM antes do primeiro pré-laudo.</p>
      </>
    ),
  },
  {
    id: 'admin-clinica', titulo: '11. Administração da clínica', palavras: 'usuários perfis veterinário administrador logo dados clínica automático manual',
    conteudo: (
      <>
        <p>Para o <b>administrador da clínica</b>:</p>
        <ul>
          <li><b>Usuários:</b> adicione pessoas (com senha provisória), escolha o perfil (Usuário, Veterinário, Administrador) e desative quem saiu. Ultrassonografistas que atendem outras clínicas usam o mesmo e-mail e senha.</li>
          <li><b>Clínica:</b> dados do cabeçalho do laudo, <b>logo</b>, e se o pré-laudo é gerado <b>automaticamente</b> ao receber o exame ou <b>manualmente</b>.</li>
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
