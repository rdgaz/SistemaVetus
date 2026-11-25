import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo } from '../ui';
import { Logo } from '../marca';

/** Troca de senha. Obrigatória no primeiro acesso (senha provisória); também usada em "Minha conta". */
export function TrocarSenha({ obrigatoria = false }: { obrigatoria?: boolean }) {
  const { recarregar, sair } = useSessao();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setOk(false);
    if (nova !== confirma) return setErro('A confirmação não confere com a nova senha.');
    try {
      await api('PUT', '/api/auth/senha', { senhaAtual: atual, novaSenha: nova });
      setAtual('');
      setNova('');
      setConfirma('');
      setOk(true);
      await recarregar();
    } catch (x) {
      setErro((x as Error).message);
    }
  };

  const formulario = (
    <form onSubmit={enviar} className="space-y-4">
      {obrigatoria && <Aviso tipo="info">Primeiro acesso: crie a sua senha para continuar.</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="ok">Senha alterada.</Aviso>}
      <Campo rotulo={obrigatoria ? 'Senha provisória' : 'Senha atual'} type="password" required
        autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
      <Campo rotulo="Nova senha" type="password" required minLength={8} autoComplete="new-password"
        dica="Mínimo de 8 caracteres." value={nova} onChange={(e) => setNova(e.target.value)} />
      <Campo rotulo="Confirme a nova senha" type="password" required autoComplete="new-password"
        value={confirma} onChange={(e) => setConfirma(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Botao type="submit">Salvar senha</Botao>
        {obrigatoria && <Botao type="button" variante="secundario" onClick={sair}>Sair</Botao>}
      </div>
    </form>
  );

  if (!obrigatoria)
    return (
      <details open={!!erro || ok} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-slate-800">Alterar minha senha</summary>
        <div className="mt-3 max-w-md">{formulario}</div>
      </details>
    );
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-md">
        <div className="mb-4 flex justify-center"><Logo className="h-12 w-auto" /></div>
        {formulario}
      </div>
    </div>
  );
}
