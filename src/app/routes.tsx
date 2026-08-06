import { createBrowserRouter, isRouteErrorResponse, Link, Navigate, useRouteError } from "react-router";
import { lazy, Suspense } from "react";

// Lazy loading das páginas
const PendixLogin = lazy(() => import("../pendix/pages/PendixLogin"));
const PendixRegistro = lazy(() => import("../pendix/pages/PendixRegistro"));
const PendixEsqueciSenha = lazy(() => import("../pendix/pages/PendixEsqueciSenha"));
const PendixRoot = lazy(() => import("../pendix/pages/PendixRoot"));
const PendixDashboard = lazy(() => import("../pendix/pages/PendixDashboard"));
const PendixClientes = lazy(() => import("../pendix/pages/PendixClientes"));
const PendixEmpresas = lazy(() => import("../pendix/pages/PendixEmpresas"));
const PendixPendencias = lazy(() => import("../pendix/pages/PendixPendencias"));
const PendixPendenciaDetalhe = lazy(() => import("../pendix/pages/PendixPendenciaDetalhe"));
const PendixCalendario = lazy(() => import("../pendix/pages/PendixCalendario"));
const PendixHistorico = lazy(() => import("../pendix/pages/PendixHistorico"));
const PendixNotificacoes = lazy(() => import("../pendix/pages/PendixNotificacoes"));
const PendixConfiguracoes = lazy(() => import("../pendix/pages/PendixConfiguracoes"));
import { RequirePendixAuth } from "../pendix/auth/RequirePendixAuth";

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#06000f]">
    <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const RouteErrorBoundary = () => {
  const error = useRouteError();

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Nao foi possivel carregar esta pagina";

  const message = error instanceof Error
    ? error.message
    : "Tente recarregar a pagina. Se o problema continuar, volte ao login e tente novamente.";

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-gray-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-purple-400">Pendix</p>
        <h1 className="mt-4 text-3xl font-light tracking-tight text-white">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-gray-400">{message}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-purple-500 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-purple-400"
          >
            Recarregar
          </button>
          <Link
            to="/pendix/login"
            className="rounded-md border border-white/15 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-gray-200 transition hover:border-white/30 hover:bg-white/5"
          >
            Ir para login
          </Link>
        </div>
      </div>
    </div>
  );
};

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/pendix/login" replace />,
  },
  {
    path: "/pendix",
    element: <Navigate to="/pendix/login" replace />,
  },
  {
    path: "/pendix/login",
    errorElement: <RouteErrorBoundary />,
    element: (
      <Suspense fallback={<PageLoader />}>
        <PendixLogin />
      </Suspense>
    ),
  },
  {
    path: "/pendix/registro",
    errorElement: <RouteErrorBoundary />,
    element: (
      <Suspense fallback={<PageLoader />}>
        <PendixRegistro />
      </Suspense>
    ),
  },
  {
    path: "/pendix/esqueci-senha",
    errorElement: <RouteErrorBoundary />,
    element: (
      <Suspense fallback={<PageLoader />}>
        <PendixEsqueciSenha />
      </Suspense>
    ),
  },
  {
    path: "/pendix/app",
    errorElement: <RouteErrorBoundary />,
    element: (
      <RequirePendixAuth>
        <Suspense fallback={<PageLoader />}>
          <PendixRoot />
        </Suspense>
      </RequirePendixAuth>
    ),
    children: [
      { index: true, element: <PendixDashboard /> },
      { path: "clientes", element: <PendixClientes /> },
      { path: "empresas", element: <PendixEmpresas /> },
      { path: "pendencias", element: <PendixPendencias /> },
      { path: "pendencias/:id", element: <PendixPendenciaDetalhe /> },
      { path: "calendario", element: <PendixCalendario /> },
      { path: "historico", element: <PendixHistorico /> },
      { path: "notificacoes", element: <PendixNotificacoes /> },
      { path: "configuracoes", element: <PendixConfiguracoes /> },
    ],
  },
]);
