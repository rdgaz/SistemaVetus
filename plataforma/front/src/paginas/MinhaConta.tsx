import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo, Cartao, Selecao, Titulo } from '../ui';
import { TrocarSenha } from './TrocarSenha';
import { EnvioImagem } from './EnvioImagem';
import { ConfigEnvio } from './ConfigEnvio';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export function MinhaConta() {
  const { usuario, recarregar } = useSessao();
  const [nome, setNome] = useState(usuario!.nome);
  const [crmv, setCrmv] = useState(usuario!.crmv ?? '');
  const [crmvUf, setCrmvUf] = useState((usuario!.crmvUf ?? '').toUpperCase());
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const alterado = nome !== usuario!.nome || crmv !== (usuario!.crmv ?? '') || crmvUf !== (usuario!.crmvUf ?? '').toUpperCase();

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
        <ConfigEnvio />
        <TrocarSenha />
      </div>
    </>
  );
}
