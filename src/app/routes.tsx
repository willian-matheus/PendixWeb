import { createBrowserRouter, isRouteErrorResponse, Link, Navigate, useRouteError } from "react-router";
import { lazy, Suspense } from "react";

// Lazy loading das páginas
const PendixLanding = lazy(() => import("../pendix/pages/PendixLanding"));
const PendixLogin = lazy(() => import("../pendix/pages/PendixLogin"));
const PendixRoot = lazy(() => import("../pendix/pages/PendixRoot"));
const PendixDashboard = lazy(() => import("../pendix/pages/PendixDashboard"));
const PendixClientes = lazy(() => import("../pendix/pages/PendixClientes"));
const PendixPendencias = lazy(() => import("../pendix/pages/PendixPendencias"));
const PendixHistorico = lazy(() => import("../pendix/pages/PendixHistorico"));
import { RequirePendixAuth } from "../pendix/auth/RequirePendixAuth";

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">Pendix</p>
        <h1 className="mt-4 text-3xl font-light tracking-tight text-white">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-gray-400">{message}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-cyan-400 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-[#0d0d0d] transition hover:bg-cyan-300"
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
    element: <Navigate to="/pendix" replace />,
  },
  {
    path: "/pendix",
    errorElement: <RouteErrorBoundary />,
    element: (
      <Suspense fallback={<PageLoader />}>
        <PendixLanding />
      </Suspense>
    ),
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
      { path: "pendencias", element: <PendixPendencias /> },
      { path: "historico", element: <PendixHistorico /> },
    ],
  },
]);
