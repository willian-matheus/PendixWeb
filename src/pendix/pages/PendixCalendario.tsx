import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Users, CalendarDays } from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  getPendixPendencias,
  type PendixPendencia, type PendixPrioridade,
} from '../services/pendix';

const PRIOR_DOT: Record<PendixPrioridade, string> = {
  baixa: '#9ca3af', media: '#eab308', alta: '#f97316', urgente: '#ef4444',
};
const PRIOR_LABEL: Record<PendixPrioridade, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type ViewMode = 'dia' | 'semana' | 'mes';

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
// Antes não havia nenhum indicador visual de atraso — uma pendência vencida
// ontem e uma com vencimento daqui a um mês apareciam idênticas.
function isVencida(p: PendixPendencia, todayKey: string): boolean {
  return p.status === 'pendente' && !!p.data_limite && p.data_limite.slice(0, 10) < todayKey;
}

export default function PendixCalendario() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [view, setView] = useState<ViewMode>('mes');
  const [cursor, setCursor] = useState(() => new Date());
  const [pendencias, setPendencias] = useState<PendixPendencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const c = {
    page:   isDark ? 'text-gray-200'                    : 'text-gray-900',
    card:   isDark ? 'bg-[#121212] border-white/8'      : 'bg-white border-gray-200',
    muted:  isDark ? 'text-gray-500'                     : 'text-gray-500',
    label:  isDark ? 'text-gray-400'                     : 'text-gray-600',
    btn:    isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50',
    cellB:  isDark ? 'border-white/[0.04]'               : 'border-gray-100',
    row:    isDark ? 'border-white/5 hover:bg-white/3'  : 'border-gray-100 hover:bg-gray-50',
  };

  async function load() {
    setLoading(true);
    try {
      const p = await getPendixPendencias();
      setPendencias(p);
    } catch {
      toast.error('Erro ao carregar pendências');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, PendixPendencia[]>();
    for (const p of pendencias) {
      if (!p.data_limite) continue;
      const key = p.data_limite.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [pendencias]);

  // Pendências sem data_limite não aparecem em nenhuma célula do calendário
  // — sem essa lista à parte, ficavam completamente invisíveis nesta tela.
  const semData = useMemo(() => pendencias.filter(p => !p.data_limite), [pendencias]);

  const todayKey = toKey(new Date());

  function prioOf(p: PendixPendencia): PendixPrioridade {
    return p.prioridade ?? 'media';
  }

  function goToday() { setCursor(new Date()); setSelectedDay(null); }
  function nav(delta: number) {
    if (view === 'dia') setCursor(prev => addDays(prev, delta));
    else if (view === 'semana') setCursor(prev => addDays(prev, delta * 7));
    else setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setSelectedDay(null);
  }

  function irParaPendencia(id: string) {
    navigate(`/pendix/app/pendencias/${id}`);
  }

  // ── Título do período ────────────────────────────────────────────────
  let titulo = '';
  if (view === 'mes') {
    titulo = `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  } else if (view === 'semana') {
    const ini = startOfWeek(cursor);
    const fim = addDays(ini, 6);
    titulo = ini.getMonth() === fim.getMonth()
      ? `${ini.getDate()} – ${fim.getDate()} de ${MESES[ini.getMonth()]}`
      : `${ini.getDate()} ${MESES[ini.getMonth()].slice(0, 3)} – ${fim.getDate()} ${MESES[fim.getMonth()].slice(0, 3)}`;
  } else {
    titulo = cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function ItemPendencia({ p }: { p: PendixPendencia }) {
    const prio = prioOf(p);
    const vencida = isVencida(p, todayKey);
    return (
      <button
        onClick={() => irParaPendencia(p.id)}
        className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b last:border-b-0 transition-colors ${c.row}`}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIOR_DOT[prio] }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{p.nome_documento}</p>
          <div className={`flex items-center gap-1.5 mt-0.5 ${c.muted}`}>
            <Users size={11} />
            <span className="text-xs truncate">{(p.pendix_clientes as any)?.nome ?? '—'}</span>
          </div>
        </div>
        {vencida && (
          <span className="text-[9px] font-black uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
            Vencida
          </span>
        )}
        <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${c.muted}`}>{PRIOR_LABEL[prio]}</span>
      </button>
    );
  }

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
          <h1 className="text-2xl font-black tracking-tight mt-1">Calendário</h1>
        </div>
        <div className="flex items-center gap-2">
          {(['dia', 'semana', 'mes'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-colors border ${
                view === v ? 'bg-purple-600 border-purple-600 text-white' : `${c.btn} ${c.label}`
              }`}
            >
              {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      {/* Navegação de período */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button onClick={() => nav(-1)} className={`p-2 rounded-xl border transition-colors ${c.btn}`}>
            <ChevronLeft size={16} className={c.label} />
          </button>
          <button onClick={() => nav(1)} className={`p-2 rounded-xl border transition-colors ${c.btn}`}>
            <ChevronRight size={16} className={c.label} />
          </button>
          <h2 className="text-sm font-black capitalize ml-1">{titulo}</h2>
        </div>
        <button onClick={goToday} className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors ${c.btn} ${c.label}`}>
          Hoje
        </button>
      </div>

      {loading ? (
        <div className={`rounded-2xl border p-14 text-center text-sm ${c.card} ${c.muted}`}>Carregando…</div>
      ) : view === 'mes' ? (
        <MonthView
          cursor={cursor} byDay={byDay} todayKey={todayKey} isDark={isDark} c={c}
          selectedDay={selectedDay} onSelectDay={setSelectedDay} prioOf={prioOf}
        />
      ) : view === 'semana' ? (
        <WeekView cursor={cursor} byDay={byDay} todayKey={todayKey} c={c} onOpen={irParaPendencia} prioOf={prioOf} />
      ) : (
        <div className={`rounded-2xl border overflow-hidden ${c.card}`}>
          {(byDay.get(toKey(cursor)) ?? []).length === 0 ? (
            <div className={`p-14 text-center text-sm ${c.muted}`}>Nenhuma pendência com vencimento neste dia.</div>
          ) : (
            (byDay.get(toKey(cursor)) ?? []).map(p => <ItemPendencia key={p.id} p={p} />)
          )}
        </div>
      )}

      {/* Lista do dia selecionado (visão mês) */}
      {view === 'mes' && selectedDay && (
        <div className={`rounded-2xl border overflow-hidden mt-5 ${c.card}`}>
          <div className={`flex items-center gap-2 px-4 py-3 border-b ${c.cellB}`}>
            <CalendarDays size={14} className="text-purple-400" />
            <span className="text-sm font-bold">
              {new Date(selectedDay + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
          </div>
          {(byDay.get(selectedDay) ?? []).length === 0 ? (
            <div className={`p-8 text-center text-sm ${c.muted}`}>Nenhuma pendência com vencimento neste dia.</div>
          ) : (
            (byDay.get(selectedDay) ?? []).map(p => <ItemPendencia key={p.id} p={p} />)
          )}
        </div>
      )}

      {/* Pendências sem data de vencimento — não aparecem em nenhuma célula acima */}
      {!loading && semData.length > 0 && (
        <div className={`rounded-2xl border overflow-hidden mt-5 ${c.card}`}>
          <div className={`flex items-center gap-2 px-4 py-3 border-b ${c.cellB}`}>
            <CalendarDays size={14} className="text-yellow-400" />
            <span className="text-sm font-bold">Sem data de vencimento</span>
            <span className={`text-xs ${c.muted}`}>({semData.length})</span>
          </div>
          {semData.map(p => <ItemPendencia key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}

// ── Visão Mês ────────────────────────────────────────────────────────────
function MonthView({ cursor, byDay, todayKey, c, selectedDay, onSelectDay, prioOf }: {
  cursor: Date; byDay: Map<string, PendixPendencia[]>; todayKey: string; isDark: boolean;
  c: Record<string, string>; selectedDay: string | null; onSelectDay: (k: string) => void;
  prioOf: (p: PendixPendencia) => PendixPrioridade;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { key: string; day: number | null }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ key: `empty-${i}`, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d });
  }

  return (
    <div className={`rounded-2xl border overflow-hidden ${c.card}`}>
      <div className={`grid grid-cols-7 border-b ${c.cellB}`}>
        {DIAS_SEMANA.map(d => (
          <div key={d} className={`py-2.5 text-center text-[10px] font-black uppercase tracking-wide ${c.muted}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(cell => {
          if (cell.day === null) return <div key={cell.key} className={`h-24 border-b border-r ${c.cellB}`} />;
          const items = byDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDay;
          return (
            <button
              key={cell.key}
              onClick={() => items.length > 0 && onSelectDay(cell.key)}
              className={`h-24 border-b border-r p-2 flex flex-col items-start text-left transition-colors ${c.cellB} ${
                isSelected ? 'bg-purple-500/10' : items.length > 0 ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                isToday ? 'bg-purple-600 text-white' : ''
              }`}>
                {cell.day}
              </span>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {items.slice(0, 4).map(p => (
                  <span
                    key={p.id}
                    className={`w-1.5 h-1.5 rounded-full ${isVencida(p, todayKey) ? 'ring-2 ring-red-500' : ''}`}
                    style={{ backgroundColor: PRIOR_DOT[prioOf(p)] }}
                  />
                ))}
              </div>
              {items.length > 0 && (
                <span className={`text-[9px] font-bold mt-auto ${c.muted}`}>{items.length} pend.</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Visão Semana ─────────────────────────────────────────────────────────
function WeekView({ cursor, byDay, todayKey, c, onOpen, prioOf }: {
  cursor: Date; byDay: Map<string, PendixPendencia[]>; todayKey: string; c: Record<string, string>;
  onOpen: (id: string) => void; prioOf: (p: PendixPendencia) => PendixPrioridade;
}) {
  const ini = startOfWeek(cursor);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i));

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {dias.map(d => {
        const key = toKey(d);
        const items = byDay.get(key) ?? [];
        const isToday = key === todayKey;
        return (
          <div key={key} className={`rounded-2xl border overflow-hidden ${c.card}`}>
            <div className={`px-3 py-2.5 border-b flex items-center justify-between ${c.cellB}`}>
              <span className={`text-[10px] font-black uppercase tracking-wide ${c.muted}`}>
                {DIAS_SEMANA[d.getDay()]}
              </span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isToday ? 'bg-purple-600 text-white' : ''}`}>
                {d.getDate()}
              </span>
            </div>
            <div className="min-h-[80px]">
              {items.length === 0 ? (
                <p className={`text-[11px] text-center py-4 ${c.muted}`}>—</p>
              ) : (
                items.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onOpen(p.id)}
                    className={`w-full text-left flex items-start gap-1.5 px-3 py-2 border-b last:border-b-0 transition-colors ${c.row}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${isVencida(p, todayKey) ? 'ring-2 ring-red-500' : ''}`}
                      style={{ backgroundColor: PRIOR_DOT[prioOf(p)] }}
                    />
                    <span className="text-[11px] font-semibold leading-tight truncate">{p.nome_documento}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
