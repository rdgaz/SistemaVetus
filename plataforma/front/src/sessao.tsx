import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clinicaGuardada, definirClinica, ErroApi, type Perfil } from './api';

export type ClinicaDoUsuario = { id: string; nome: string; perfil: Perfil };

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  crmv: string | null;
  crmvUf: string | null;
  administradorSistema: boolean;
  trocarSenha: boolean;
  clinicas: ClinicaDoUsuario[];
};

type Sessao = {
  usuario: Usuario | null;
  carregando: boolean;
  clinica: ClinicaDoUsuario | null;
  escolherClinica: (id: string) => void;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
};

const Contexto = createContext<Sessao | null>(null);

export function useSessao() {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSessao fora do ProvedorSessao');
  return s;
}

/** Escolhe a clínica guardada no navegador, se o usuário ainda tiver acesso; senão a primeira. */
function resolverClinica(u: Usuario | null) {
  if (!u || u.clinicas.length === 0) {
    definirClinica(null);
    return null;
  }
  const c = u.clinicas.find((x) => x.id === clinicaGuardada()) ?? u.clinicas[0];
  definirClinica(c.id);
  return c;
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [clinica, setClinica] = useState<ClinicaDoUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const aplicar = useCallback((u: Usuario | null) => {
    setUsuario(u);
    setClinica(resolverClinica(u));
  }, []);

  const recarregar = useCallback(async () => {
    try {
      aplicar(await api<Usuario>('GET', '/api/auth/eu'));
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) aplicar(null);
      else throw e;
    }
  }, [aplicar]);

  useEffect(() => {
    recarregar().catch(() => aplicar(null)).finally(() => setCarregando(false));
  }, [recarregar, aplicar]);

  const entrar = async (email: string, senha: string) => {
    aplicar(await api<Usuario>('POST', '/api/auth/entrar', { email, senha }));
  };

  const sair = async () => {
    await api('POST', '/api/auth/sair').catch(() => undefined);
    aplicar(null);
  };

  const escolherClinica = (id: string) => {
    const c = usuario?.clinicas.find((x) => x.id === id);
    if (!c) return;
    definirClinica(c.id);
    setClinica(c);
  };

  return (
    <Contexto.Provider value={{ usuario, carregando, clinica, escolherClinica, entrar, sair, recarregar }}>
      {children}
    </Contexto.Provider>
  );
}
