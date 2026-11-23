import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, nomePerfil, type Perfil } from '../api';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo, Cartao, Segredo, Selecao, Titulo } from '../ui';

type UsuarioClinica = {
  usuarioId: string;
  nome: string;
  email: string;
  crmv: string | null;
  crmvUf: string | null;
  perfil: Perfil;
  identidadePropria: boolean;
  ativo: boolean;
};

type Criado = { nome: string; email: string; contaNova: boolean; senhaProvisoria: string | null };

const perfis: Perfil[] = ['Usuario', 'Veterinario', 'AdministradorClinica'];

export function Usuarios() {
  const { usuario, clinica, recarregar } = useSessao();
  const [lista, setLista] = useState<UsuarioClinica[]>([]);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);

  const carregar = useCallback(() => {
    api<UsuarioClinica[]>('GET', '/api/clinica/usuarios').then(setLista).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar, clinica]);

  const alterar = async (u: UsuarioClinica, mudanca: Partial<Pick<UsuarioClinica, 'perfil' | 'ativo'>>) => {
    setErro('');
    try {
      await api('PUT', `/api/clinica/usuarios/${u.usuarioId}`, mudanca);
      carregar();
      if (u.usuarioId === usuario?.id) await recarregar(); // mudou o próprio perfil
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <>
      <Titulo>Usuários</Titulo>
      <div className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        {criado && (
          <Cartao titulo="Acesso criado">
            <p className="mb-3 text-sm">
              <b>{criado.nome}</b> ({criado.email}){' '}
              {criado.contaNova
                ? 'já pode entrar com a senha provisória abaixo e criará a própria senha no primeiro acesso.'
                : 'já tinha conta no AutoLaudoVet e agora também acessa esta clínica com a mesma senha.'}
            </p>
            {criado.senhaProvisoria && <Segredo rotulo="Senha provisória" valor={criado.senhaProvisoria} />}
            <Botao variante="secundario" className="mt-3" onClick={() => setCriado(null)}>Fechar</Botao>
          </Cartao>
        )}

        {novo ? (
          <NovoUsuario
            aoCancelar={() => setNovo(false)}
            aoCriar={(c) => {
              setNovo(false);
              setCriado(c);
              carregar();
            }}
          />
        ) : (
          <Botao onClick={() => setNovo(true)}>+ Adicionar usuário</Botao>
        )}

        <div className="space-y-2">
          {lista.map((u) => (
            <div key={u.usuarioId}
              className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center ${u.ativo ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {u.nome} {!u.ativo && <span className="text-sm text-slate-500">(desativado)</span>}
                </div>
                <div className="truncate text-sm text-slate-500">
                  {u.email}
                  {u.crmv && ` · CRMV ${u.crmv}${u.crmvUf ? `/${u.crmvUf}` : ''}`}
                </div>
              </div>
              <div className="flex gap-2">
                <Selecao aria-label="Perfil" value={u.perfil} disabled={!u.ativo}
                  onChange={(e) => alterar(u, { perfil: e.target.value as Perfil })}>
                  {perfis.map((p) => <option key={p} value={p}>{nomePerfil[p]}</option>)}
                </Selecao>
                <Botao variante={u.ativo ? 'perigo' : 'secundario'} onClick={() => alterar(u, { ativo: !u.ativo })}>
                  {u.ativo ? 'Desativar' : 'Reativar'}
                </Botao>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function NovoUsuario({ aoCancelar, aoCriar }: { aoCancelar: () => void; aoCriar: (c: Criado) => void }) {
  const [f, setF] = useState({ nome: '', email: '', perfil: 'Usuario' as Perfil, crmv: '', crmvUf: '' });
  const [erro, setErro] = useState('');
  const mudar = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    try {
      aoCriar(await api<Criado>('POST', '/api/clinica/usuarios', f));
    } catch (x) {
      setErro((x as Error).message);
    }
  };

  return (
    <Cartao titulo="Adicionar usuário">
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <p className="text-sm text-slate-500">
          Se o e-mail já tiver conta no AutoLaudoVet (ex.: ultrassonografista que atende outras clínicas), ele só ganha
          acesso a esta clínica.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome" value={f.nome} onChange={mudar('nome')} />
          <Campo rotulo="E-mail" type="email" required value={f.email} onChange={mudar('email')} />
          <Selecao rotulo="Perfil" value={f.perfil} onChange={mudar('perfil')}>
            {perfis.map((p) => <option key={p} value={p}>{nomePerfil[p]}</option>)}
          </Selecao>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Campo rotulo="CRMV" value={f.crmv} onChange={mudar('crmv')} dica="Veterinários" />
            <Campo rotulo="UF" maxLength={2} value={f.crmvUf} onChange={mudar('crmvUf')} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao type="submit">Adicionar</Botao>
          <Botao type="button" variante="secundario" onClick={aoCancelar}>Cancelar</Botao>
        </div>
      </form>
    </Cartao>
  );
}
