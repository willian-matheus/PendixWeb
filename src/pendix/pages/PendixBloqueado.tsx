import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ExternalLink, LogOut } from 'lucide-react';
import { useAuth } from '../../app/auth/AuthProvider';
import { faturaEmAberto, formatarBRL, formatarData, type Fatura } from '../services/faturas';

/** Tela de acesso suspenso por inadimplência.
 *
 *  Fica FORA do RequireAdimplente de propósito: dentro dele, o redirect
 *  entraria em laço infinito. */
export default function PendixBloqueado() {
  const { user, signOut } = useAuth();
  const [fatura, setFatura] = useState<Fatura | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!user?.companyId) { setCarregando(false); return; }
    faturaEmAberto(user.companyId)
      .then(setFatura)
      .catch(() => setFatura(null))
      .finally(() => setCarregando(false));
  }, [user?.companyId]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-gray-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">
            Acesso suspenso
          </p>
        </div>

        <h1 className="mt-4 text-3xl font-light tracking-tight text-white">
          Mensalidade em aberto
        </h1>

        <p className="mt-4 text-sm leading-6 text-gray-400">
          O envio de documentos está suspenso porque a mensalidade venceu há mais de
          3 dias. Assim que o pagamento for confirmado, o acesso volta
          automaticamente — não é preciso avisar ninguém.
        </p>

        {carregando ? (
          <div className="mt-8 h-24 animate-pulse rounded-xl bg-white/5" />
        ) : fatura ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-widest text-gray-500">Competência</dt>
                <dd className="mt-1 text-gray-200">{formatarData(fatura.competencia)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-gray-500">Vencimento</dt>
                <dd className="mt-1 text-gray-200">{formatarData(fatura.vencimento)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs uppercase tracking-widest text-gray-500">Valor</dt>
                <dd className="mt-1 text-2xl font-light text-white">
                  {formatarBRL(Number(fatura.valor))}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-gray-400">
            Não foi possível carregar a fatura. Entre em contato com o seu escritório
            contábil para regularizar.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {fatura?.link_pagamento ? (
            <a
              href={fatura.link_pagamento}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-purple-500 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-purple-400"
            >
              Pagar agora <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="rounded-md border border-white/15 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
              Procure o seu escritório
            </span>
          )}

          <Link
            to="/pendix/bloqueado"
            onClick={(e) => { e.preventDefault(); window.location.reload(); }}
            className="rounded-md border border-white/15 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-gray-200 transition hover:border-white/30 hover:bg-white/5"
          >
            Já paguei
          </Link>

          <button
            type="button"
            onClick={() => signOut()}
            className="inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-500 transition hover:text-gray-300"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}
