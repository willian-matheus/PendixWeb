import { useEffect, useMemo, useState } from 'react';
import { CreditCard, ExternalLink, Plus, Receipt, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../app/theme/ThemeProvider';
import { getPendixEmpresas, type PendixEmpresa } from '../services/empresas';
import {
  listarFaturas, listarAssinaturas, criarAssinatura, criarFaturaAvulsa,
  formatarBRL, formatarData,
  type Fatura, type Assinatura, type StatusFatura, type StatusAssinatura,
} from '../services/faturas';

const STATUS_FATURA_BADGE: Record<StatusFatura, string> = {
  aberta:    'bg-amber-500/15 text-amber-400 border-amber-500/20',
  paga:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  vencida:   'bg-red-500/15 text-red-400 border-red-500/20',
  cancelada: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};
const STATUS_ASSINATURA_LABEL: Record<StatusAssinatura, string> = {
  pending: 'Aguardando autorização', authorized: 'Ativa',
  paused: 'Pausada', cancelled: 'Cancelada',
};

type ModalAssinatura = { empresa: PendixEmpresa; valor: string; dia: string; email: string };
type ModalAvulsa = { empresa: PendixEmpresa; valor: string; descricao: string; vencimento: string };

export default function PendixFinanceiro() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [empresas, setEmpresas] = useState<PendixEmpresa[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [modalAssinatura, setModalAssinatura] = useState<ModalAssinatura | null>(null);
  const [modalAvulsa, setModalAvulsa] = useState<ModalAvulsa | null>(null);

  const c = {
    page:   isDark ? 'text-gray-200'                    : 'text-gray-900',
    card:   isDark ? 'bg-[#121212] border-white/8'      : 'bg-white border-gray-200',
    muted:  isDark ? 'text-gray-500'                    : 'text-gray-500',
    row:    isDark ? 'border-white/5 hover:bg-white/3'  : 'border-gray-100 hover:bg-gray-50',
    input:  isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
    modal:  isDark ? 'bg-[#18181b] border-white/10'     : 'bg-white border-gray-200',
    label:  isDark ? 'text-gray-400'                    : 'text-gray-600',
  };

  async function load() {
    setLoading(true);
    try {
      const [e, f, a] = await Promise.all([
        getPendixEmpresas(), listarFaturas(), listarAssinaturas(),
      ]);
      setEmpresas(e); setFaturas(f); setAssinaturas(a);
    } catch {
      toast.error('Erro ao carregar o financeiro');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const assinaturaPorEmpresa = useMemo(() => {
    const m = new Map<string, Assinatura>();
    for (const a of assinaturas) if (a.status !== 'cancelled') m.set(a.empresa_id, a);
    return m;
  }, [assinaturas]);

  const ultimaFaturaPorEmpresa = useMemo(() => {
    const m = new Map<string, Fatura>();
    // faturas já vêm ordenadas por competência desc, então a primeira vence.
    for (const f of faturas) if (!m.has(f.empresa_id)) m.set(f.empresa_id, f);
    return m;
  }, [faturas]);

  async function salvarAssinatura() {
    if (!modalAssinatura) return;
    const valor = Number(modalAssinatura.valor.replace(',', '.'));
    const dia = Number(modalAssinatura.dia);

    if (!Number.isFinite(valor) || valor <= 0) return toast.error('Informe um valor válido');
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
      return toast.error('O dia de vencimento deve estar entre 1 e 28');
    }
    if (!modalAssinatura.email.includes('@')) return toast.error('Informe o e-mail do pagador');

    setSalvando(true);
    try {
      const { initPoint } = await criarAssinatura({
        empresaId: modalAssinatura.empresa.id,
        valor, diaCobranca: dia, payerEmail: modalAssinatura.email,
      });
      setModalAssinatura(null);
      toast.success('Assinatura criada. Envie o link para a empresa autorizar.');
      if (initPoint) window.open(initPoint, '_blank', 'noopener');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar a assinatura');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarAvulsa() {
    if (!modalAvulsa) return;
    const valor = Number(modalAvulsa.valor.replace(',', '.'));

    if (!Number.isFinite(valor) || valor <= 0) return toast.error('Informe um valor válido');
    if (!modalAvulsa.descricao.trim()) return toast.error('Descreva a cobrança');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(modalAvulsa.vencimento)) {
      return toast.error('Informe o vencimento');
    }

    setSalvando(true);
    try {
      const { linkPagamento } = await criarFaturaAvulsa({
        empresaId: modalAvulsa.empresa.id,
        valor, descricao: modalAvulsa.descricao, vencimento: modalAvulsa.vencimento,
      });
      setModalAvulsa(null);
      toast.success('Fatura avulsa criada.');
      if (linkPagamento) window.open(linkPagamento, '_blank', 'noopener');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar a fatura');
    } finally {
      setSalvando(false);
    }
  }

  const hojeIso = new Date().toISOString().slice(0, 10);

  return (
    <div className={`p-6 ${c.page}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">Financeiro</h1>
        <p className={`mt-1 text-sm ${c.muted}`}>
          Mensalidade das empresas atendidas, cobrada pelo Mercado Pago.
        </p>
      </div>

      <div className={`rounded-xl border ${c.card}`}>
        {loading ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : empresas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Receipt className={`h-8 w-8 ${c.muted}`} />
            <p className={`text-sm ${c.muted}`}>
              Cadastre uma empresa antes de configurar a mensalidade.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b text-xs uppercase tracking-widest ${c.row} ${c.muted}`}>
                <th className="px-5 py-3 text-left font-medium">Empresa</th>
                <th className="px-5 py-3 text-left font-medium">Assinatura</th>
                <th className="px-5 py-3 text-right font-medium">Mensalidade</th>
                <th className="px-5 py-3 text-left font-medium">Última fatura</th>
                <th className="px-5 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((emp) => {
                const assinatura = assinaturaPorEmpresa.get(emp.id);
                const fatura = ultimaFaturaPorEmpresa.get(emp.id);
                return (
                  <tr key={emp.id} className={`border-b transition ${c.row}`}>
                    <td className="px-5 py-4 font-medium">{emp.nome}</td>
                    <td className={`px-5 py-4 ${assinatura ? '' : c.muted}`}>
                      {assinatura ? STATUS_ASSINATURA_LABEL[assinatura.status] : 'Sem assinatura'}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {assinatura
                        ? `${formatarBRL(Number(assinatura.valor))} · dia ${assinatura.dia_cobranca}`
                        : '—'}
                    </td>
                    <td className="px-5 py-4">
                      {fatura ? (
                        <span className={`rounded-md border px-2 py-1 text-xs ${STATUS_FATURA_BADGE[fatura.status]}`}>
                          {formatarData(fatura.vencimento)} · {formatarBRL(Number(fatura.valor))}
                        </span>
                      ) : (
                        <span className={c.muted}>—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {!assinatura && (
                          <button
                            type="button"
                            onClick={() => setModalAssinatura({
                              empresa: emp, valor: '', dia: '10', email: emp.email ?? '',
                            })}
                            className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-500"
                          >
                            <CreditCard className="h-3 w-3" /> Assinatura
                          </button>
                        )}
                        {assinatura?.status === 'pending' && assinatura.init_point && (
                          <a
                            href={assinatura.init_point}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/5"
                          >
                            Link <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setModalAvulsa({
                            empresa: emp, valor: '', descricao: '', vencimento: hojeIso,
                          })}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/5"
                        >
                          <Plus className="h-3 w-3" /> Avulsa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalAssinatura && (
        <Modal titulo={`Assinatura — ${modalAssinatura.empresa.nome}`} onFechar={() => setModalAssinatura(null)} classes={c}>
          <Campo label="Valor mensal (R$)" classes={c}>
            <input
              type="text" inputMode="decimal" placeholder="450,00"
              value={modalAssinatura.valor}
              onChange={(e) => setModalAssinatura({ ...modalAssinatura, valor: e.target.value })}
              className={`w-full rounded-md border px-3 py-2 text-sm ${c.input}`}
            />
          </Campo>
          <Campo label="Dia do vencimento (1 a 28)" classes={c}>
            <input
              type="number" min={1} max={28}
              value={modalAssinatura.dia}
              onChange={(e) => setModalAssinatura({ ...modalAssinatura, dia: e.target.value })}
              className={`w-full rounded-md border px-3 py-2 text-sm ${c.input}`}
            />
            <p className={`mt-1 text-xs ${c.muted}`}>
              Limitado a 28 porque 29, 30 e 31 não existem em todo mês.
            </p>
          </Campo>
          <Campo label="E-mail do pagador" classes={c}>
            <input
              type="email" placeholder="financeiro@empresa.com.br"
              value={modalAssinatura.email}
              onChange={(e) => setModalAssinatura({ ...modalAssinatura, email: e.target.value })}
              className={`w-full rounded-md border px-3 py-2 text-sm ${c.input}`}
            />
          </Campo>
          <Acoes salvando={salvando} onCancelar={() => setModalAssinatura(null)} onSalvar={salvarAssinatura} rotulo="Criar assinatura" />
        </Modal>
      )}

      {modalAvulsa && (
        <Modal titulo={`Fatura avulsa — ${modalAvulsa.empresa.nome}`} onFechar={() => setModalAvulsa(null)} classes={c}>
          <Campo label="Descrição" classes={c}>
            <input
              type="text" placeholder="Honorários extras de dezembro"
              value={modalAvulsa.descricao}
              onChange={(e) => setModalAvulsa({ ...modalAvulsa, descricao: e.target.value })}
              className={`w-full rounded-md border px-3 py-2 text-sm ${c.input}`}
            />
          </Campo>
          <Campo label="Valor (R$)" classes={c}>
            <input
              type="text" inputMode="decimal" placeholder="300,00"
              value={modalAvulsa.valor}
              onChange={(e) => setModalAvulsa({ ...modalAvulsa, valor: e.target.value })}
              className={`w-full rounded-md border px-3 py-2 text-sm ${c.input}`}
            />
          </Campo>
          <Campo label="Vencimento" classes={c}>
            <input
              type="date"
              value={modalAvulsa.vencimento}
              onChange={(e) => setModalAvulsa({ ...modalAvulsa, vencimento: e.target.value })}
              className={`w-full rounded-md border px-3 py-2 text-sm ${c.input}`}
            />
          </Campo>
          <Acoes salvando={salvando} onCancelar={() => setModalAvulsa(null)} onSalvar={salvarAvulsa} rotulo="Criar fatura" />
        </Modal>
      )}
    </div>
  );
}

type Classes = Record<string, string>;

function Modal({ titulo, onFechar, classes, children }: {
  titulo: string; onFechar: () => void; classes: Classes; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`w-full max-w-md rounded-xl border p-6 ${classes.modal}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-light">{titulo}</h2>
          <button type="button" onClick={onFechar} className={classes.muted}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Campo({ label, classes, children }: {
  label: string; classes: Classes; children: React.ReactNode;
}) {
  return (
    <div>
      <label className={`mb-1.5 block text-xs font-medium ${classes.label}`}>{label}</label>
      {children}
    </div>
  );
}

function Acoes({ salvando, onCancelar, onSalvar, rotulo }: {
  salvando: boolean; onCancelar: () => void; onSalvar: () => void; rotulo: string;
}) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button
        type="button" onClick={onCancelar} disabled={salvando}
        className="rounded-md border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest transition hover:bg-white/5 disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="button" onClick={onSalvar} disabled={salvando}
        className="rounded-md bg-purple-500 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-purple-400 disabled:opacity-50"
      >
        {salvando ? 'Salvando...' : rotulo}
      </button>
    </div>
  );
}
