import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { reais } from '../dinheiro';
import { Aviso, Botao, Campo, Cartao, Segredo, Titulo } from '../ui';

type Clinica = {
  id: string;
  numero: number;
  nome: string;
  documento: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  aeTitle: string;
  ativa: boolean;
  teste: boolean;
  saldoBrl: number;
  usuarios: number;
  administradores: { nome: string; email: string }[];
};

type Criada = {
  nome: string;
  aeTitle: string;
  tokenIngestao: string;
  administrador: { nome: string; email: string; contaNova: boolean; senhaProvisoria: string | null };
};

/** Administração do sistema: cadastro de clínicas. */
export function AdminClinicas() {
  const { recarregar } = useSessao();
  const [lista, setLista] = useState<Clinica[]>([]);
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState(false);
  const [criada, setCriada] = useState<Criada | null>(null);
  const [token, setToken] = useState<{ clinica: string; valor: string } | null>(null);

  const carregar = useCallback(() => {
    api<Clinica[]>('GET', '/api/admin/clinicas').then(setLista).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const alternarAtiva = async (c: Clinica) => {
    if (c.ativa && !confirm(`Bloquear "${c.nome}"? Os usuários deixam de acessar e o ultrassom deixa de enviar.`)) return;
    try {
      await api('PUT', `/api/admin/clinicas/${c.id}`, { ...c, ativa: !c.ativa });
      carregar();
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const alternarTeste = async (c: Clinica) => {
    const msg = c.teste
      ? `Tornar "${c.nome}" uma clínica REAL?\n\nEla passará a entrar nos totais financeiros reais e suas correções entrarão no banco global da IA.`
      : `Marcar "${c.nome}" como CLÍNICA DE TESTE?\n\nEla sai dos totais financeiros reais (pode ser vista pelo filtro "Somente testes") e suas correções não entram no banco global das clínicas reais.`;
    if (!confirm(msg)) return;
    setErro('');
    try {
      await api('PUT', `/api/admin/clinicas/${c.id}`, { ...c, teste: !c.teste });
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const movimentarSaldo = async (c: Clinica) => {
    const texto = prompt(`Valor em R$ para "${c.nome}" (positivo = recarga, negativo = ajuste):`, '50');
    if (!texto) return;
    const valor = Number(texto.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(valor) || valor === 0) return setErro('Valor inválido.');
    const descricao = prompt('Descrição (aparece no extrato da clínica):', valor > 0 ? 'Recarga de créditos (Pix)' : 'Ajuste') ?? '';
    try {
      await api('POST', `/api/admin/clinicas/${c.id}/saldo`, { valor, descricao });
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const novoToken = async (c: Clinica) => {
    if (!confirm(`Gerar um novo token de ingestão para "${c.nome}"? O token atual deixa de funcionar.`)) return;
    try {
      const r = await api<{ tokenIngestao: string }>('POST', `/api/admin/clinicas/${c.id}/token-ingestao`);
      setToken({ clinica: c.nome, valor: r.tokenIngestao });
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <>
      <Titulo>Clínicas</Titulo>
      <div className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}

        {criada && (
          <Cartao titulo={`Clínica criada: ${criada.nome}`}>
            <div className="space-y-3 text-sm">
              <p>
                Título AE para o ultrassom: <span className="font-mono font-semibold">{criada.aeTitle}</span>
              </p>
              <p>
                Administrador: <b>{criada.administrador.nome}</b> ({criada.administrador.email})
                {!criada.administrador.contaNova && ' — já tinha conta e foi vinculado a esta clínica.'}
              </p>
              {criada.administrador.senhaProvisoria && (
                <Segredo rotulo="Senha provisória do administrador" valor={criada.administrador.senhaProvisoria} />
              )}
              <Segredo rotulo="Token antigo da clínica (não usado: os apps usam Aparelhos e apps)" valor={criada.tokenIngestao} />
              <Botao variante="secundario" onClick={() => setCriada(null)}>Fechar</Botao>
            </div>
          </Cartao>
        )}

        {token && (
          <Cartao titulo={`Novo token: ${token.clinica}`}>
            <Segredo rotulo="Token da API de ingestão" valor={token.valor} />
            <Botao variante="secundario" className="mt-3" onClick={() => setToken(null)}>Fechar</Botao>
          </Cartao>
        )}

        {nova ? (
          <NovaClinica
            aoCancelar={() => setNova(false)}
            aoCriar={async (c) => {
              setNova(false);
              setCriada(c);
              carregar();
              await recarregar(); // se o próprio admin virou administrador da clínica
            }}
          />
        ) : (
          <Botao onClick={() => setNova(true)}>+ Nova clínica</Botao>
        )}

        <div className="space-y-2">
          {lista.map((c) => (
            <div key={c.id}
              className={`flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center ${c.teste ? 'border-violet-200 bg-violet-50/20' : 'border-slate-200'} ${c.ativa ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  <span>{c.nome}</span>
                  {c.teste && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800"
                      title="Clínica de teste: fora dos totais financeiros reais e do banco global de correções da IA">
                      TESTE
                    </span>
                  )}
                  {!c.ativa && <span className="text-sm text-red-700">(bloqueada)</span>}
                </div>
                <div className="text-sm text-slate-500">
                  <span className="font-mono">{c.aeTitle}</span> · {c.usuarios} usuário(s)
                  {c.administradores.length > 0 && ` · adm.: ${c.administradores.map((a) => a.nome).join(', ')}`}
                </div>
                <div className={`text-sm font-medium ${c.saldoBrl <= 0 ? 'text-red-700' : 'text-slate-700'}`}>
                  Créditos de IA: {reais(c.saldoBrl)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" onClick={() => movimentarSaldo(c)}>+ Crédito</Botao>
                <Botao variante="secundario" onClick={() => alternarTeste(c)}
                  title={c.teste ? 'Passar esta clínica para produção (real)' : 'Isolar esta clínica como clínica de teste'}>
                  {c.teste ? 'Tornar real' : 'Marcar teste'}
                </Botao>
                <Botao variante="secundario" onClick={() => novoToken(c)}>Novo token</Botao>
                <Botao variante={c.ativa ? 'perigo' : 'secundario'} onClick={() => alternarAtiva(c)}>
                  {c.ativa ? 'Bloquear' : 'Ativar'}
                </Botao>
              </div>
            </div>
          ))}
          {lista.length === 0 && <p className="text-slate-500">Nenhuma clínica cadastrada.</p>}
        </div>
      </div>
    </>
  );
}

function NovaClinica({ aoCancelar, aoCriar }: { aoCancelar: () => void; aoCriar: (c: Criada) => void }) {
  const [f, setF] = useState({ nome: '', documento: '', telefone: '', email: '', endereco: '', admNome: '', admEmail: '', teste: false });
  const [erro, setErro] = useState('');
  const mudar = (k: Exclude<keyof typeof f, 'teste'>) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    try {
      const { admNome, admEmail, ...clinica } = f;
      aoCriar(await api<Criada>('POST', '/api/admin/clinicas', {
        ...clinica,
        administrador: { nome: admNome, email: admEmail },
      }));
    } catch (x) {
      setErro((x as Error).message);
    }
  };

  return (
    <Cartao titulo="Nova clínica">
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome da clínica" required value={f.nome} onChange={mudar('nome')} />
          <Campo rotulo="CNPJ / CPF" value={f.documento} onChange={mudar('documento')} />
          <Campo rotulo="Telefone" type="tel" value={f.telefone} onChange={mudar('telefone')} />
          <Campo rotulo="E-mail da clínica" type="email" value={f.email} onChange={mudar('email')} />
          <div className="sm:col-span-2">
            <Campo rotulo="Endereço" value={f.endereco} onChange={mudar('endereco')} />
          </div>
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <input type="checkbox" className="mt-0.5 size-5" checked={f.teste} onChange={(e) => setF({ ...f, teste: e.target.checked })} />
          <span>
            <span className="font-medium text-slate-800">Clínica de teste</span>
            <span className="block text-xs text-slate-500">
              Funciona normalmente para validar laudos, correções e relatórios, mas não entra nos totais financeiros reais nem no banco global de correções da IA.
            </span>
          </span>
        </label>
        <h3 className="pt-2 font-semibold text-slate-700">Administrador da clínica</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome" value={f.admNome} onChange={mudar('admNome')}
            dica="Não precisa se o e-mail já tiver conta." />
          <Campo rotulo="E-mail (login)" type="email" required value={f.admEmail} onChange={mudar('admEmail')} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao type="submit">Criar clínica</Botao>
          <Botao type="button" variante="secundario" onClick={aoCancelar}>Cancelar</Botao>
        </div>
      </form>
    </Cartao>
  );
}
