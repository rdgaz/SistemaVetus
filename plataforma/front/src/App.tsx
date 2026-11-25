import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { Logo, Rodape } from './marca';
import { Ajuda } from './paginas/Ajuda';
import { nomePerfil } from './api';
import { useSessao } from './sessao';
import { Entrar } from './paginas/Entrar';
import { TrocarSenha } from './paginas/TrocarSenha';
import { Exames } from './paginas/Exames';
import { EnvioPendrive } from './paginas/EnvioPendrive';
import { ExameDetalhe } from './paginas/ExameDetalhe';
import { Usuarios } from './paginas/Usuarios';
import { DadosClinica } from './paginas/DadosClinica';
import { LayoutLaudo } from './paginas/LayoutLaudo';
import { MinhaConta } from './paginas/MinhaConta';
import { AdminClinicas } from './paginas/AdminClinicas';
import { AdminCobranca } from './paginas/AdminCobranca';
import { AdminIa } from './paginas/AdminIa';
import { Registros } from './paginas/Registros';
import { AdminReferencias } from './paginas/AdminReferencias';
import { Verificar } from './paginas/Verificar';
import { LaudoPublico } from './paginas/LaudoPublico';

/** Extrai até 2 iniciais do nome (ignorando títulos como Dr./Dra.). */
export function iniciaisNome(nome?: string | null): string {
  const partes = (nome ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^(dr\.?|dra\.?|de|da|do|das|dos)$/i.test(p));
  if (partes.length === 0) return 'U';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function App() {
  // páginas públicas (sem login)
  return (
    <Routes>
      <Route path="verificar/:codigo" element={<Verificar />} />
      <Route path="laudo/:token" element={<LaudoPublico />} />
      <Route path="*" element={<AppComLogin />} />
    </Routes>
  );
}

function AppComLogin() {
  const { usuario, carregando } = useSessao();

  if (carregando) return <div className="p-8 text-center text-slate-500">Carregando…</div>;
  if (!usuario)
    return (
      <Routes>
        <Route path="*" element={<Entrar />} />
      </Routes>
    );
  if (usuario.trocarSenha) return <TrocarSenha obrigatoria />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Exames />} />
        <Route path="exames/pendrive" element={<EnvioPendrive />} />
        <Route path="exames/:id" element={<ExameDetalhe />} />
        <Route path="usuarios" element={<SoAdminClinica><Usuarios /></SoAdminClinica>} />
        <Route path="clinica" element={<SoAdminClinica><DadosClinica /></SoAdminClinica>} />
        <Route path="clinica/layout" element={<SoAdminClinica><LayoutLaudo /></SoAdminClinica>} />
        <Route path="clinica/registros" element={<SoAdminClinica><Registros /></SoAdminClinica>} />
        <Route path="conta" element={<MinhaConta />} />
        <Route path="ajuda" element={usuario.clinicas.length > 0 ? <Ajuda /> : <Navigate to="/" replace />} />
        <Route
          path="admin/clinicas"
          element={usuario.administradorSistema ? <AdminClinicas /> : <Navigate to="/" replace />}
        />
        <Route
          path="admin/referencias"
          element={usuario.administradorSistema ? <AdminReferencias /> : <Navigate to="/" replace />}
        />
        <Route
          path="admin/cobranca"
          element={usuario.administradorSistema ? <AdminCobranca /> : <Navigate to="/" replace />}
        />
        <Route path="admin/ia" element={usuario.administradorSistema ? <AdminIa /> : <Navigate to="/" replace />} />
        <Route path="admin/registros" element={usuario.administradorSistema ? <Registros sistema /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function SoAdminClinica({ children }: { children: ReactNode }) {
  const { clinica } = useSessao();
  return clinica?.perfil === 'AdministradorClinica' ? <>{children}</> : <Navigate to="/" replace />;
}

/** Cabeçalho com a clínica atual, navegação principal e avatar do usuário com menu rápido. */
function Layout() {
  const { usuario, clinica, escolherClinica, sair } = useSessao();
  const [menuAberto, setMenuAberto] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const menuContaRef = useRef<HTMLDivElement>(null);
  const local = useLocation();
  const adminClinica = clinica?.perfil === 'AdministradorClinica';

  useEffect(() => {
    setContaAberta(false);
    setMenuAberto(false);
  }, [local.pathname]);

  useEffect(() => {
    if (!contaAberta) return;
    const fechar = (e: MouseEvent) => {
      if (menuContaRef.current && !menuContaRef.current.contains(e.target as Node)) setContaAberta(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setContaAberta(false); };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', esc);
    };
  }, [contaAberta]);

  const emClinica = local.pathname.startsWith('/clinica') || local.pathname.startsWith('/usuarios');
  const itens = [
    { para: '/', texto: 'Exames', mostrar: true, end: true },
    { para: '/clinica', texto: 'Clínica', mostrar: adminClinica, end: false, ativoExtra: emClinica },
    { para: '/admin/clinicas', texto: 'Clínicas (sistema)', mostrar: usuario!.administradorSistema, end: true },
    { para: '/admin/cobranca', texto: 'Cobrança (sistema)', mostrar: usuario!.administradorSistema, end: true },
    { para: '/admin/referencias', texto: 'Referências (sistema)', mostrar: usuario!.administradorSistema, end: true },
    { para: '/admin/ia', texto: 'IA (sistema)', mostrar: usuario!.administradorSistema, end: true },
    { para: '/admin/registros', texto: 'Registros (sistema)', mostrar: usuario!.administradorSistema, end: true },
  ].filter((i) => i.mostrar);

  const link = (ativoExtra?: boolean) => ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium ${isActive || ativoExtra ? 'bg-white/15 text-white' : 'text-white/80 hover:text-white'}`;

  const iniciais = iniciaisNome(usuario!.nome);
  const primeiroNome = usuario!.nome.trim().split(/\s+/)[0] || usuario!.nome;
  const temCrmv = !!(usuario?.crmv && usuario?.crmvUf);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-[#0E4D64] text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link to="/" className="shrink-0" aria-label="Início"><Logo branco className="h-8 w-auto" /></Link>

          {usuario!.clinicas.length > 1 ? (
            <select
              aria-label="Clínica"
              value={clinica?.id}
              onChange={(e) => escolherClinica(e.target.value)}
              className="min-h-10 max-w-[48vw] truncate rounded-lg bg-white/10 px-2.5 text-sm text-white outline-none [&>option]:text-slate-900"
            >
              {usuario!.clinicas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-sm text-white/80">{clinica?.nome}</span>
          )}

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {itens.map((i) => (
              <NavLink key={i.para} to={i.para} end={i.end} className={link(i.ativoExtra)}>
                {i.texto}
              </NavLink>
            ))}
          </nav>

          {/* Bolinha com as iniciais e menu do usuário */}
          <div ref={menuContaRef} className="relative ml-auto md:ml-2">
            <button
              type="button"
              onClick={() => setContaAberta((v) => !v)}
              aria-expanded={contaAberta}
              aria-label="Menu do usuário"
              className="flex min-h-10 items-center gap-2 rounded-full bg-white/10 py-1 pl-1.5 pr-2.5 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-white text-xs font-bold tracking-tight text-[#0E4D64] shadow-sm">
                {iniciais}
              </span>
              <span className="hidden max-w-[9rem] truncate sm:inline">{primeiroNome}</span>
              <span className="text-xs text-white/75">▾</span>
            </button>

            {contaAberta && (
              <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-xl">
                <div className="flex items-start gap-3 border-b border-slate-100 px-2.5 py-2.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0E4D64] text-sm font-bold text-white">
                    {iniciais}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900">{usuario!.nome}</div>
                    <div className="truncate text-xs text-slate-500">{usuario!.email}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {clinica && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {nomePerfil[clinica.perfil]}
                        </span>
                      )}
                      {temCrmv ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                          CRMV-{usuario!.crmvUf?.toUpperCase()} {usuario!.crmv}
                        </span>
                      ) : (
                        <Link to="/conta" className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:underline">
                          Cadastrar CRMV
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div className="py-1">
                  <Link to="/conta" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    <span>Minha conta</span>
                    <span className="text-xs text-slate-400">CRMV, assinatura e senha</span>
                  </Link>
                  {adminClinica && (
                    <>
                      <Link to="/clinica" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        <span>Configurações da clínica</span>
                        <span className="text-xs text-slate-400">Dados e envio</span>
                      </Link>
                      <Link to="/usuarios" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        <span>Usuários da clínica</span>
                        <span className="text-xs text-slate-400">Equipe</span>
                      </Link>
                      <Link to="/clinica/registros" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        <span>Registros de atividade</span>
                        <span className="text-xs text-slate-400">Quem fez o quê e quando</span>
                      </Link>
                    </>
                  )}
                  {!!clinica && (
                    <Link to="/ajuda" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <span>Ajuda</span>
                      <span className="text-xs text-slate-400">Guia rápido</span>
                    </Link>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    onClick={sair}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Sair da conta
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            className="min-h-10 min-w-10 rounded-lg text-2xl md:hidden"
            aria-label="Menu"
            onClick={() => setMenuAberto((v) => !v)}
          >
            ☰
          </button>
        </div>

        {menuAberto && (
          <nav className="border-t border-white/10 px-4 pb-3 md:hidden" onClick={() => setMenuAberto(false)}>
            {itens.map((i) => (
              <NavLink key={i.para} to={i.para} end={i.end} className={link(i.ativoExtra)}>
                {i.texto}
              </NavLink>
            ))}
            <NavLink to="/conta" className={link()}>Minha conta</NavLink>
            {!!clinica && <NavLink to="/ajuda" className={link()}>Ajuda</NavLink>}
            <button onClick={sair} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white/80">
              Sair
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        <Outlet />
      </main>
      <Rodape comAjuda={!!clinica} />
    </div>
  );
}
