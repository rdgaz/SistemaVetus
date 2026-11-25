import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Aviso, Botao, Campo, Cartao, Selecao } from '../ui';

export type Preferencias = {
  whatsapp: boolean;
  email: boolean;
  link: boolean;
  pdf: boolean;
  linkValidadeDias: number;
  smtpConfigurado: boolean;
  smtp: {
    host: string | null;
    porta: number | null;
    seguranca: 'ssl' | 'starttls' | 'nenhuma';
    usuario: string | null;
    senhaDefinida: boolean;
    remetenteNome: string | null;
    remetenteEmail: string | null;
  };
};

/** Atalhos de servidores comuns. */
const PROVEDORES: Record<string, { host: string; porta: number; seguranca: 'ssl' | 'starttls' }> = {
  Gmail: { host: 'smtp.gmail.com', porta: 587, seguranca: 'starttls' },
  'Outlook / Hotmail': { host: 'smtp-mail.outlook.com', porta: 587, seguranca: 'starttls' },
  'Yahoo': { host: 'smtp.mail.yahoo.com', porta: 465, seguranca: 'ssl' },
  'Hostinger': { host: 'smtp.hostinger.com', porta: 465, seguranca: 'ssl' },
};

/** "Minha conta" → canais de envio que aparecem no Compartilhar e o SMTP próprio. */
export function ConfigEnvio() {
  const [p, setP] = useState<Preferencias | null>(null);
  const [inicial, setInicial] = useState('');
  const [senha, setSenha] = useState('');
  const [para, setPara] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api<Preferencias>('GET', '/api/auth/envio')
      .then((x) => { setP(x); setInicial(JSON.stringify(x)); })
      .catch((e) => setErro(e.message));
  }, []);
  if (!p) return erro ? <Aviso>{erro}</Aviso> : null;

  const s = p.smtp;
  const alterado = JSON.stringify(p) !== inicial || senha.length > 0;
  const mudarSmtp = (m: Partial<Preferencias['smtp']>) => { setP({ ...p, smtp: { ...s, ...m } }); setOk(''); };
  const canal = (k: 'whatsapp' | 'email' | 'link' | 'pdf', titulo: string, dica: string) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50">
      <input type="checkbox" className="mt-0.5 size-5" checked={p[k]} onChange={(e) => { setP({ ...p, [k]: e.target.checked }); setOk(''); }} />
      <span><span className="font-medium">{titulo}</span><span className="block text-xs text-slate-500">{dica}</span></span>
    </label>
  );

  const executar = async (acao: () => Promise<void>, msg: string) => {
    setErro('');
    setOk('');
    setOcupado(true);
    try {
      await acao();
      setOk(msg);
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const salvar = (e?: FormEvent, limparSenha = false) => {
    e?.preventDefault();
    return executar(async () => {
      const novo = await api<Preferencias>('PUT', '/api/auth/envio', {
        whatsapp: p.whatsapp, email: p.email, link: p.link, pdf: p.pdf, linkValidadeDias: p.linkValidadeDias,
        smtp: { ...s, senha, limparSenha },
      });
      setP(novo);
      setInicial(JSON.stringify(novo));
      setSenha('');
    }, 'Configuração de envio salva.');
  };
  const testar = () => executar(async () => {
    await api('POST', '/api/auth/envio/teste', { para });
  }, `E-mail de teste enviado para ${para}. Confira a caixa de entrada (e o spam).`);

  return (
    <Cartao titulo="Envio de laudos">
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}

        <div className="space-y-2">
          <p className="text-sm text-slate-600">Canais que aparecem para você no bloco <b>Compartilhar</b> do laudo assinado:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {canal('whatsapp', 'WhatsApp', 'Abre o WhatsApp com a mensagem e o link do laudo.')}
            {canal('pdf', 'Baixar PDF', 'Baixar o arquivo ou enviar pelo celular.')}
            {canal('link', 'Copiar link', 'Link público do laudo, sem login, com validade.')}
            {canal('email', 'E-mail (SMTP próprio)', 'Envia o PDF anexado direto da sua conta de e-mail.')}
          </div>
          {(p.whatsapp || p.link) && (
            <div className="max-w-xs pt-1">
              <Campo rotulo="Validade dos links públicos (dias)" type="number" min={1} max={365} value={p.linkValidadeDias}
                onChange={(e) => { setP({ ...p, linkValidadeDias: Number(e.target.value) }); setOk(''); }} />
            </div>
          )}
        </div>

        {p.email && (
          <details open={!p.smtpConfigurado} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <summary className="cursor-pointer font-semibold text-slate-700">
              Configurar servidor de e-mail (SMTP)
              {p.smtpConfigurado
                ? <span className="ml-2 text-xs font-medium text-green-700">✓ Configurado ({s.remetenteEmail || s.usuario})</span>
                : <span className="ml-2 text-xs font-medium text-amber-800">● Pendente</span>}
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-600">
                Os laudos saem do seu próprio e-mail. Em Gmail e Outlook, use uma <b>senha de app</b> (criada nas configurações
                de segurança da conta), não a senha normal.
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PROVEDORES).map(([nome, cfg]) => (
                  <button key={nome} type="button" onClick={() => mudarSmtp(cfg)}
                    className="min-h-8 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100">
                    Preencher {nome}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Campo rotulo="Servidor (host)" placeholder="smtp.seudominio.com.br" value={s.host ?? ''} onChange={(e) => mudarSmtp({ host: e.target.value })} />
                <Campo rotulo="Porta" type="number" placeholder="587" value={s.porta ?? ''} onChange={(e) => mudarSmtp({ porta: e.target.value ? Number(e.target.value) : null })} />
                <Selecao rotulo="Segurança" value={s.seguranca} onChange={(e) => mudarSmtp({ seguranca: e.target.value as Preferencias['smtp']['seguranca'] })}>
                  <option value="starttls">STARTTLS (587)</option>
                  <option value="ssl">SSL (465)</option>
                  <option value="nenhuma">Nenhuma</option>
                </Selecao>
                <Campo rotulo="Usuário (login)" autoComplete="off" value={s.usuario ?? ''} onChange={(e) => mudarSmtp({ usuario: e.target.value })} />
                <Campo rotulo="Senha (ou senha de app)" type="password" autoComplete="new-password" value={senha}
                  placeholder={s.senhaDefinida ? '•••••••• (guardada)' : ''} onChange={(e) => { setSenha(e.target.value); setOk(''); }}
                  dica={s.senhaDefinida ? 'Deixe em branco para manter a atual.' : undefined} />
                <Campo rotulo="Nome do remetente" placeholder="Clínica Exemplo" value={s.remetenteNome ?? ''} onChange={(e) => mudarSmtp({ remetenteNome: e.target.value })} />
                <Campo rotulo="E-mail do remetente" type="email" value={s.remetenteEmail ?? ''} onChange={(e) => mudarSmtp({ remetenteEmail: e.target.value })} />
              </div>
              {s.senhaDefinida && (
                <button type="button" className="text-sm text-red-700 underline" onClick={() => salvar(undefined, true)}>Apagar a senha guardada</button>
              )}
              {p.smtpConfigurado && (
                <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                  <div className="min-w-60 flex-1">
                    <Campo rotulo="Enviar e-mail de teste para" type="email" value={para} onChange={(e) => setPara(e.target.value)} />
                  </div>
                  <Botao type="button" variante="secundario" disabled={ocupado || !para} onClick={testar}>Enviar teste</Botao>
                </div>
              )}
            </div>
          </details>
        )}

        <div className="flex items-center gap-3">
          <Botao type="submit" disabled={!alterado || ocupado}>{ocupado ? 'Salvando…' : 'Salvar preferências'}</Botao>
          {alterado && <span className="text-sm font-medium text-amber-800">● Alterações não salvas</span>}
        </div>
      </form>
    </Cartao>
  );
}
