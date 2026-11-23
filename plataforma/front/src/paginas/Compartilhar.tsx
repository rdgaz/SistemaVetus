import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Aviso, Botao, Campo } from '../ui';
import type { Preferencias } from './ConfigEnvio';

type Link = { id: string; url: string; criadoEm: string; expiraEm: string; revogado: boolean; acessos: number; ativo: boolean };
type Envio = { meio: string; destinatario: string | null; usuarioNome: string; em: string; laudoVersao: number };
type Dados = { links: Link[]; historico: Envio[] };

const nomeMeio: Record<string, string> = { whatsapp: 'WhatsApp', email: 'E-mail', link: 'Link copiado', pdf: 'PDF' };
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** "55" + DDD + número, só dígitos (para o wa.me). */
function telefoneWhatsapp(t: string) {
  const d = t.replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

/** Compartilhar o laudo assinado: só os canais ativos em "Minha conta". */
export function Compartilhar({ exameId, paciente, tutor, telefone, emailTutor, clinica }: {
  exameId: string;
  paciente: string;
  tutor: string | null;
  telefone: string | null;
  emailTutor: string | null;
  clinica: string;
}) {
  const [pref, setPref] = useState<Preferencias | null>(null);
  const [dados, setDados] = useState<Dados | null>(null);
  const [aberto, setAberto] = useState<'whatsapp' | 'email' | null>(null);
  const [fone, setFone] = useState(telefone ?? '');
  const [para, setPara] = useState(emailTutor ?? '');
  const saudacao = tutor ? `Olá, ${tutor.split(' ')[0]}!` : 'Olá!';
  const [mensagem, setMensagem] = useState(`${saudacao} O laudo do exame de ultrassonografia de ${paciente} está disponível.`);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    api<Dados>('GET', `/api/exames/${exameId}/compartilhamentos`).then(setDados).catch(() => undefined);
  }, [exameId]);
  useEffect(() => {
    api<Preferencias>('GET', '/api/auth/envio').then(setPref).catch((e) => setErro(e.message));
    carregar();
  }, [carregar]);

  const obterLink = () => api<{ url: string }>('POST', `/api/exames/${exameId}/compartilhar/link`).then((r) => r.url);
  const registrar = (meio: string, destinatario?: string) =>
    api('POST', `/api/exames/${exameId}/compartilhar/registrar`, { meio, destinatario }).then(carregar).catch(() => undefined);

  const executar = async (acao: () => Promise<string>) => {
    setErro('');
    setOk('');
    setOcupado(true);
    try {
      setOk(await acao());
      carregar();
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const enviarWhatsapp = () => {
    // abre a janela já no clique (navegadores bloqueiam janelas abertas depois de uma espera)
    const janela = window.open('', '_blank');
    return executar(async () => {
      const url = await obterLink().catch((x) => { janela?.close(); throw x; });
      const numero = telefoneWhatsapp(fone);
      const texto = `${mensagem}\n\n${url}\n\n${clinica}`;
      const destino = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
      if (janela) janela.location.href = destino; else window.location.href = destino;
      await registrar('whatsapp', numero || undefined);
      return 'WhatsApp aberto com a mensagem e o link.';
    });
  };

  const enviarEmail = () => executar(async () => {
    const url = pref?.link || pref?.whatsapp ? await obterLink() : null;
    const destinos = para.split(/[,;\s]+/).filter(Boolean);
    await api('POST', `/api/exames/${exameId}/compartilhar/email`, {
      para: destinos,
      assunto: `Laudo de ultrassonografia: ${paciente}`,
      mensagem: `${mensagem}\n\nO PDF do laudo está em anexo.${url ? `\nTambém pode ser aberto pelo link: ${url}` : ''}\n\n${clinica}`,
      anexarPdf: true,
    });
    return `E-mail enviado para ${destinos.join(', ')}.`;
  });

  const copiarLink = () => executar(async () => {
    const url = await obterLink();
    await navigator.clipboard?.writeText(url);
    await registrar('link');
    return `Link copiado: ${url}`;
  });

  const baixarPdf = () => {
    window.open(`/api/exames/${exameId}/laudo.pdf`, '_blank');
    registrar('pdf');
  };

  // celular: manda o próprio arquivo PDF pela tela de compartilhar do aparelho
  const podeCompartilharArquivo = typeof navigator !== 'undefined' && 'canShare' in navigator;
  const compartilharArquivo = () => executar(async () => {
    const r = await fetch(`/api/exames/${exameId}/laudo.pdf`, { credentials: 'same-origin' });
    const arquivo = new File([await r.blob()], `Laudo_${paciente}.pdf`, { type: 'application/pdf' });
    if (!navigator.canShare?.({ files: [arquivo] })) throw new Error('Este aparelho não permite compartilhar arquivos.');
    await navigator.share({ files: [arquivo], title: `Laudo de ${paciente}`, text: mensagem });
    await registrar('pdf', 'compartilhar do aparelho');
    return 'PDF compartilhado.';
  });

  const revogar = (l: Link) => {
    if (!confirm('Revogar este link? Quem tiver o link não conseguirá mais abrir o laudo.')) return;
    executar(async () => {
      await api('DELETE', `/api/exames/${exameId}/links/${l.id}`);
      return 'Link revogado.';
    });
  };

  if (!pref) return erro ? <Aviso>{erro}</Aviso> : null;
  const nenhum = !pref.whatsapp && !pref.email && !pref.link && !pref.pdf;
  const botao = (ativo: boolean) =>
    `min-h-11 rounded-lg border px-4 font-medium ${ativo ? 'border-[#0E4D64] bg-[#0E4D64] text-white' : 'border-slate-300 bg-white text-[#0E4D64] hover:bg-slate-50'}`;

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <h3 className="font-semibold text-slate-700">Compartilhar</h3>
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {nenhum && <p className="text-sm text-slate-500">Nenhum canal de envio ativo. Ative em "Minha conta" → Envio de laudos.</p>}

      <div className="flex flex-wrap gap-2">
        {pref.whatsapp && <button className={botao(aberto === 'whatsapp')} onClick={() => setAberto(aberto === 'whatsapp' ? null : 'whatsapp')}>WhatsApp</button>}
        {pref.email && (pref.smtpConfigurado
          ? <button className={botao(aberto === 'email')} onClick={() => setAberto(aberto === 'email' ? null : 'email')}>E-mail</button>
          : <span className="self-center text-xs text-slate-500">E-mail: configure o SMTP em "Minha conta".</span>)}
        {pref.link && <button className={botao(false)} disabled={ocupado} onClick={copiarLink}>Copiar link</button>}
        {pref.pdf && <button className={botao(false)} onClick={baixarPdf}>Baixar PDF</button>}
        {pref.pdf && podeCompartilharArquivo && <button className={botao(false)} disabled={ocupado} onClick={compartilharArquivo}>Enviar PDF (celular)</button>}
      </div>

      {(aberto === 'whatsapp' || aberto === 'email') && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {aberto === 'whatsapp'
            ? <Campo rotulo="WhatsApp (com DDD)" type="tel" placeholder="(11) 99999-0000" value={fone} onChange={(e) => setFone(e.target.value)}
                dica="Em branco: o WhatsApp abre para você escolher o contato." />
            : <Campo rotulo="Para (e-mails separados por vírgula)" value={para} onChange={(e) => setPara(e.target.value)} />}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Mensagem</span>
            <textarea rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-base outline-none focus:border-[#0E4D64]" />
          </label>
          <p className="text-xs text-slate-500">
            {aberto === 'whatsapp' ? 'O link do laudo é colocado no fim da mensagem.' : 'O PDF vai anexado; o link entra no fim da mensagem.'}
          </p>
          <Botao disabled={ocupado || (aberto === 'email' && !para.trim())} onClick={aberto === 'whatsapp' ? enviarWhatsapp : enviarEmail}>
            {aberto === 'whatsapp' ? 'Abrir WhatsApp' : ocupado ? 'Enviando…' : 'Enviar e-mail'}
          </Botao>
        </div>
      )}

      {dados && dados.links.some((l) => l.ativo) && (
        <div className="text-sm">
          <div className="mb-1 font-medium text-slate-700">Links ativos</div>
          {dados.links.filter((l) => l.ativo).map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 text-slate-600">
              <span className="truncate font-mono text-xs">{l.url}</span>
              <span>· vale até {new Date(l.expiraEm).toLocaleDateString('pt-BR')} · {l.acessos} acesso(s)</span>
              <button className="text-red-700 underline" onClick={() => revogar(l)}>revogar</button>
            </div>
          ))}
        </div>
      )}

      {dados && dados.historico.length > 0 && (
        <div className="text-sm">
          <div className="mb-1 font-medium text-slate-700">Envios</div>
          <ul className="space-y-0.5 text-slate-600">
            {dados.historico.map((h, i) => (
              <li key={i}>
                {dataHora(h.em)} · {nomeMeio[h.meio] ?? h.meio}{h.destinatario && ` → ${h.destinatario}`} · {h.usuarioNome}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
