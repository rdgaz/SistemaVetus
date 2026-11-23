import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo, Cartao, Titulo } from '../ui';
import { EnvioImagem } from './EnvioImagem';
import { SaldoClinica } from './SaldoClinica';

type Dados = {
  id: string;
  nome: string;
  documento: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  aeTitle: string;
  gerarAutomaticamente: boolean;
};

export function DadosClinica() {
  const { clinica, recarregar } = useSessao();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    api<Dados>('GET', '/api/clinica').then(setD).catch((e) => setErro(e.message));
  }, [clinica]);

  if (!d) return erro ? <Aviso>{erro}</Aviso> : null;
  const mudar = (k: keyof Dados) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setOk(false);
    try {
      await api('PUT', '/api/clinica', d);
      setOk(true);
      await recarregar(); // o nome aparece no cabeçalho
    } catch (x) {
      setErro((x as Error).message);
    }
  };

  return (
    <>
      <Titulo>Clínica</Titulo>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="ok">Dados salvos.</Aviso>}

        <Cartao titulo="Dados (aparecem no cabeçalho do laudo)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome" required value={d.nome} onChange={mudar('nome')} />
            <Campo rotulo="CNPJ / CPF" value={d.documento ?? ''} onChange={mudar('documento')} />
            <Campo rotulo="Telefone" type="tel" value={d.telefone ?? ''} onChange={mudar('telefone')} />
            <Campo rotulo="E-mail" type="email" value={d.email ?? ''} onChange={mudar('email')} />
            <div className="sm:col-span-2">
              <Campo rotulo="Endereço" value={d.endereco ?? ''} onChange={mudar('endereco')} />
            </div>
          </div>
        </Cartao>

        <SaldoClinica comExtrato />

        <Cartao titulo="Pré-laudo">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 size-5" checked={d.gerarAutomaticamente}
              onChange={(e) => setD({ ...d, gerarAutomaticamente: e.target.checked })} />
            <span>
              <span className="font-medium">Gerar o pré-laudo automaticamente ao receber o exame</span>
              <span className="block text-sm text-slate-500">
                Desligado: o exame espera em "Aguardando dados" até alguém pedir a geração.
              </span>
            </span>
          </label>
        </Cartao>

        <EnvioImagem titulo="Logo (cabeçalho do laudo)" alt="Logo da clínica"
          urlVer={`/api/clinicas/${d.id}/logo`} urlEnviar="/api/clinica/logo"
          explicacao="Aparece no topo do PDF de todos os laudos da clínica." />

        <Cartao titulo="Ultrassom (DICOM)">
          <p className="text-sm">
            Título AE desta clínica: <span className="font-mono font-semibold">{d.aeTitle}</span>
          </p>
        </Cartao>

        <Botao type="submit">Salvar</Botao>
      </form>
    </>
  );
}
