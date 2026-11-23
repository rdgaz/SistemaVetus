import { useState, type FormEvent } from 'react';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo } from '../ui';

export function Entrar() {
  const { entrar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-md">
        <div className="text-center">
          <div className="text-3xl font-bold text-[#1f3b57]">Vetus</div>
          <div className="text-sm text-slate-500">Laudos de ultrassom veterinário</div>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        {/* no celular: sem maiúscula automática e sem corretor (alterariam o e-mail e a senha) */}
        <Campo rotulo="E-mail" type="email" autoComplete="username" required value={email}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email"
          onChange={(e) => setEmail(e.target.value.trim())} />
        <Campo rotulo="Senha" type="password" autoComplete="current-password" required value={senha}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(e) => setSenha(e.target.value)} />
        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? 'Entrando…' : 'Entrar'}
        </Botao>
      </form>
    </div>
  );
}
