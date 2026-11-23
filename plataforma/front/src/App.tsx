import { useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router';
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
import { MinhaConta } from './paginas/MinhaConta';
import { AdminClinicas } from './paginas/AdminClinicas';
import { AdminCobranca } from './paginas/AdminCobranca';
import { AdminReferencias } from './paginas/AdminReferencias';
import { Verificar } from './paginas/Verificar';
import { LaudoPublico } from './paginas/LaudoPublico';

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function SoAdminClinica({ children }: { children: ReactNode }) {
  const { clinica } = useSessao();
  return clinica?.perfil === 'AdministradorClinica' ? <>{children}</> : <Navigate to="/" replace />;
}

/** Cabeçalho com a clínica atual e o menu (no celular, o menu abre pelo botão ☰). */
function Layout() {
  const { usuario, clinica, escolherClinica, sair } = useSessao();
  const [menuAberto, setMenuAberto] = useState(false);
  const adminClinica = clinica?.perfil === 'AdministradorClinica';

  const itens = [
    { para: '/', texto: 'Exames', mostrar: true },
    { para: '/usuarios', texto: 'Usuários', mostrar: adminClinica },
    { para: '/clinica', texto: 'Clínica', mostrar: adminClinica },
    { para: '/admin/clinicas', texto: 'Clínicas (sistema)', mostrar: usuario!.administradorSistema },
    { para: '/admin/cobranca', texto: 'Cobrança (sistema)', mostrar: usuario!.administradorSistema },
    { para: '/admin/referencias', texto: 'Referências (sistema)', mostrar: usuario!.administradorSistema },
    { para: '/conta', texto: 'Minha conta', mostrar: true },
    { para: '/ajuda', texto: 'Ajuda', mostrar: !!clinica }, // ajuda: só para quem acessa uma clínica
  ].filter((i) => i.mostrar);

  const link = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 font-medium ${isActive ? 'bg-white/15 text-white' : 'text-white/80 hover:text-white'}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-[#0E4D64] text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link to="/" className="shrink-0" aria-label="Início"><Logo branco className="h-8 w-auto" /></Link>

          {usuario!.clinicas.length > 1 ? (
            <select
              aria-label="Clínica"
              value={clinica?.id}
              onChange={(e) => escolherClinica(e.target.value)}
              className="min-h-10 max-w-[55vw] truncate rounded-lg bg-white/10 px-2 text-sm text-white outline-none [&>option]:text-slate-900"
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
              <NavLink key={i.para} to={i.para} end className={link}>
                {i.texto}
              </NavLink>
            ))}
            <button onClick={sair} className="px-3 py-2 font-medium text-white/80 hover:text-white">
              Sair
            </button>
          </nav>

          <button
            className="ml-auto min-h-11 min-w-11 rounded-lg text-2xl md:hidden"
            aria-label="Menu"
            onClick={() => setMenuAberto((v) => !v)}
          >
            ☰
          </button>
        </div>

        {menuAberto && (
          <nav className="border-t border-white/10 px-4 pb-3 md:hidden" onClick={() => setMenuAberto(false)}>
            {itens.map((i) => (
              <NavLink key={i.para} to={i.para} end className={link}>
                {i.texto}
              </NavLink>
            ))}
            <button onClick={sair} className="block w-full rounded-lg px-3 py-2 text-left font-medium text-white/80">
              Sair
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        <div className="mb-4 text-sm text-slate-500">
          {usuario!.nome}
          {clinica && ` · ${nomePerfil[clinica.perfil]}`}
        </div>
        <Outlet />
      </main>
      <Rodape comAjuda={!!clinica} />
    </div>
  );
}
