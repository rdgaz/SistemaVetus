import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo, Cartao, Titulo } from '../ui';
import { TrocarSenha } from './TrocarSenha';
import { EnvioImagem } from './EnvioImagem';
import { ConfigEnvio } from './ConfigEnvio';

export function MinhaConta() {
  const { usuario, recarregar } = useSessao();
  const [nome, setNome] = useState(usuario!.nome);
  const [crmv, setCrmv] = useState(usuario!.crmv ?? '');
  const [crmvUf, setCrmvUf] = useState(usuario!.crmvUf ?? '');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setOk(false);
    try {
      await api('PUT', '/api/auth/eu', { nome, crmv, crmvUf });
      await recarregar();
      setOk(true);
    } catch (x) {
      setErro((x as Error).message);
    }
  };

  return (
    <>
      <Titulo>Minha conta</Titulo>
      <div className="space-y-4">
        <Cartao titulo="Dados">
          <form onSubmit={salvar} className="space-y-4">
            {erro && <Aviso>{erro}</Aviso>}
            {ok && <Aviso tipo="ok">Dados salvos.</Aviso>}
            <Campo rotulo="E-mail (login)" value={usuario!.email} disabled />
            <Campo rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <Campo rotulo="CRMV" value={crmv} onChange={(e) => setCrmv(e.target.value)}
                dica="Necessário para assinar laudos." />
              <Campo rotulo="UF" maxLength={2} value={crmvUf} onChange={(e) => setCrmvUf(e.target.value)} />
            </div>
            <Botao type="submit">Salvar</Botao>
          </form>
        </Cartao>
        <EnvioImagem titulo="Assinatura" alt="Assinatura" urlVer="/api/auth/assinatura" urlEnviar="/api/auth/assinatura" urlUso="/api/auth/assinatura/uso"
          explicacao="Imagem da sua assinatura (foto ou digitalização), impressa nos laudos que você assinar. Opcional: sem ela, o laudo sai com o seu nome e CRMV." />
        <ConfigEnvio />
        <TrocarSenha />
      </div>
    </>
  );
}
