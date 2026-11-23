import { useState, type FormEvent } from 'react';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo } from '../ui';
import { linkSuporte, Logo, Rodape } from '../marca';

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
    <div className="flex min-h-dvh flex-col">
     <div className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-md">
        <div className="flex justify-center pb-1">
          <Logo className="h-14 w-auto" />
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
        <div className="text-center text-sm">
          <a href={linkSuporte('não consigo entrar')} target="_blank" rel="noreferrer" className="text-slate-500 underline">
            Problemas para entrar? Fale com o suporte
          </a>
        </div>
      </form>
     </div>
     <Rodape />
    </div>
  );
}
