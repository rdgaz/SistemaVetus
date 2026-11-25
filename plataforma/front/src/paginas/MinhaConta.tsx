import { useState, type FormEvent } from 'react';
import { api, nomePerfil } from '../api';
import { iniciaisNome } from '../App';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo, Cartao, Selecao, Titulo } from '../ui';
import { TrocarSenha } from './TrocarSenha';
import { EnvioImagem } from './EnvioImagem';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export function MinhaConta() {
  const { usuario, clinica, recarregar } = useSessao();
  const [nome, setNome] = useState(usuario!.nome);
  const [crmv, setCrmv] = useState(usuario!.crmv ?? '');
  const [crmvUf, setCrmvUf] = useState((usuario!.crmvUf ?? '').toUpperCase());
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const alterado = nome !== usuario!.nome || crmv !== (usuario!.crmv ?? '') || crmvUf !== (usuario!.crmvUf ?? '').toUpperCase();
  const temCrmv = !!(usuario?.crmv && usuario?.crmvUf);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setOk(false);
    setSalvando(true);
    try {
      await api('PUT', '/api/auth/eu', { nome, crmv, crmvUf });
      await recarregar();
      setOk(true);
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Titulo>Minha conta</Titulo>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#0E4D64] text-lg font-bold text-white shadow-sm">
            {iniciaisNome(nome || usuario!.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold text-slate-900">{usuario!.nome}</div>
            <div className="truncate text-sm text-slate-500">{usuario!.email}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {clinica && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {clinica.nome} · {nomePerfil[clinica.perfil]}
                </span>
              )}
              {temCrmv ? (
                <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                  ✓ Apto a assinar (CRMV-{usuario!.crmvUf?.toUpperCase()} {usuario!.crmv})
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  ● Preencha o CRMV abaixo para assinar laudos
                </span>
              )}
            </div>
          </div>
        </div>

        <Cartao titulo="Dados profissionais">
          <form onSubmit={salvar} className="space-y-4">
            {erro && <Aviso>{erro}</Aviso>}
            {ok && <Aviso tipo="ok">Dados salvos.</Aviso>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome completo (sai na assinatura do laudo)" required value={nome} onChange={(e) => { setNome(e.target.value); setOk(false); }} />
              <Campo rotulo="E-mail (login)" value={usuario!.email} disabled />
            </div>
            <div className="grid max-w-md grid-cols-[1fr_7rem] gap-3">
              <Campo rotulo="Número do CRMV" placeholder="ex.: 12345" value={crmv} onChange={(e) => { setCrmv(e.target.value); setOk(false); }}
                dica="Obrigatório para aprovar e assinar laudos." />
              <Selecao rotulo="UF" value={crmvUf} onChange={(e) => { setCrmvUf(e.target.value); setOk(false); }}>
                <option value="">—</option>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </Selecao>
            </div>
            <div className="flex items-center gap-3">
              <Botao type="submit" disabled={!alterado || salvando}>{salvando ? 'Salvando…' : 'Salvar dados'}</Botao>
              {alterado && <span className="text-sm font-medium text-amber-800">● Alterações não salvas</span>}
            </div>
          </form>
        </Cartao>
        <EnvioImagem titulo="Assinatura digitalizada" alt="Assinatura" urlVer="/api/auth/assinatura" urlEnviar="/api/auth/assinatura" urlUso="/api/auth/assinatura/uso"
          explicacao="Imagem da sua assinatura ou carimbo, impressa nos laudos que você assinar. Opcional: sem ela, o laudo sai com o seu nome e CRMV." />
        <TrocarSenha />
      </div>
    </>
  );
}
