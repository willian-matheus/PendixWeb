import { createContext, useContext, useState, type ReactNode } from 'react';

export type AccentColorId = 'roxo' | 'azul' | 'verde' | 'laranja';

export const ACCENT_COLORS: Record<AccentColorId, { label: string; from: string; to: string; className: string }> = {
  roxo:    { label: 'Roxo',    from: '#9333ea', to: '#7c3aed', className: 'bg-purple-500' },
  azul:    { label: 'Azul',    from: '#3b82f6', to: '#2563eb', className: 'bg-blue-500' },
  verde:   { label: 'Verde',   from: '#10b981', to: '#059669', className: 'bg-emerald-500' },
  laranja: { label: 'Laranja', from: '#f97316', to: '#ea580c', className: 'bg-orange-500' },
};

const STORAGE_KEY = 'pendix_cor_principal';

// Uma versão anterior gravava esse valor com JSON.stringify (ex: '"roxo"').
// Aceita os dois formatos e cai pro padrão se o valor salvo não for válido.
function readStoredAccent(): AccentColorId {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return 'roxo';
  const cleaned = raw.replace(/^"|"$/g, '');
  return cleaned in ACCENT_COLORS ? (cleaned as AccentColorId) : 'roxo';
}

interface AccentCtx {
  accent: AccentColorId;
  setAccent: (id: AccentColorId) => void;
}

const AccentColorContext = createContext<AccentCtx>({ accent: 'roxo', setAccent: () => {} });

export function AccentColorProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentColorId>(readStoredAccent);

  const setAccent = (id: AccentColorId) => {
    setAccentState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <AccentColorContext.Provider value={{ accent, setAccent }}>
      {children}
    </AccentColorContext.Provider>
  );
}

export function useAccentColor() {
  return useContext(AccentColorContext);
}
