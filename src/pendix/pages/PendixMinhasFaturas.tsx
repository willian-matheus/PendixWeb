import { useEffect, useState } from 'react';
import { ExternalLink, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../app/theme/ThemeProvider';
import { useAuth } from '../../app/auth/AuthProvider';
import { listarFaturas, formatarBRL, formatarData, type Fatura, type StatusFatura } from '../services/faturas';

const STATUS_BADGE: Record<StatusFatura, string> = {
  aberta:    'bg-amber-500/15 text-amber-400 border-amber-500/20',
  paga:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  vencida:   'bg-red-500/15 text-red-400 border-red-500/20',
  cancelada: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};
const STATUS_LABEL: Record<StatusFatura, string> = {
  aberta: 'Em aberto', paga: 'Paga', vencida: 'Vencida', cancelada: 'Cancelada',
};

export default function PendixMinhasFaturas() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === 'dark';

  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [loading, setLoading] = useState(true);

  const c = {
    page:  isDark ? 'text-gray-200'                   : 'text-gray-900',
    card:  isDark ? 'bg-[#121212] border-white/8'     : 'bg-white border-gray-200',
    muted: isDark ? 'text-gray-500'                   : 'text-gray-500',
    row:   isDark ? 'border-white/5 hover:bg-white/3' : 'border-gray-100 hover:bg-gray-50',
  };

  useEffect(() => {
    if (!user?.companyId) { setLoading(false); return; }
    listarFaturas(user.companyId)
      .then(setFaturas)
      .catch(() => toast.error('Erro ao carregar faturas'))
      .finally(() => setLoading(false));
  }, [user?.companyId]);

  return (
    <div className={`p-6 ${c.page}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">Minhas faturas</h1>
        <p className={`mt-1 text-sm ${c.muted}`}>
          Mensalidades cobradas pelo seu escritório contábil.
        </p>
      </div>

      <div className={`rounded-xl border ${c.card}`}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : faturas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Receipt className={`h-8 w-8 ${c.muted}`} />
            <p className={`text-sm ${c.muted}`}>Nenhuma fatura por aqui ainda.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b text-xs uppercase tracking-widest ${c.row} ${c.muted}`}>
                <th className="px-5 py-3 text-left font-medium">Competência</th>
                <th className="px-5 py-3 text-left font-medium">Vencimento</th>
                <th className="px-5 py-3 text-right font-medium">Valor</th>
                <th className="px-5 py-3 text-left font-medium">Situação</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {faturas.map((f) => (
                <tr key={f.id} className={`border-b transition ${c.row}`}>
                  <td className="px-5 py-4">{formatarData(f.competencia)}</td>
                  <td className="px-5 py-4">{formatarData(f.vencimento)}</td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {formatarBRL(Number(f.valor))}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-md border px-2 py-1 text-xs ${STATUS_BADGE[f.status]}`}>
                      {STATUS_LABEL[f.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {(f.status === 'aberta' || f.status === 'vencida') && f.link_pagamento && (
                      <a
                        href={f.link_pagamento}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-500"
                      >
                        Pagar <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
