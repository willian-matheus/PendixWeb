import { useState } from 'react';
import { User, Lock, Palette, CreditCard, Sun, Moon, LogOut, Check } from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { useAuth } from '../../app/auth/AuthProvider';
import { toast } from 'sonner';
import { readLocal, writeLocal } from '../lib/localStore';

const CORES = [
  { id: 'roxo', label: 'Roxo', hex: '#8b5cf6', className: 'bg-purple-500' },
  { id: 'azul', label: 'Azul', hex: '#3b82f6', className: 'bg-blue-500' },
  { id: 'verde', label: 'Verde', hex: '#10b981', className: 'bg-emerald-500' },
  { id: 'laranja', label: 'Laranja', hex: '#f97316', className: 'bg-orange-500' },
];

export default function PendixConfiguracoes() {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut, updatePassword } = useAuth();
  const isDark = theme === 'dark';

  const [nome, setNome] = useState(user?.nome ?? '');
  const [email] = useState(user?.email ?? '');
  const [telefone, setTelefone] = useState('');
  const [savingPerfil, setSavingPerfil] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [savingSenha, setSavingSenha] = useState(false);

  const [corPrincipal, setCorPrincipal] = useState(() => readLocal('pendix_cor_principal', 'roxo'));

  const c = {
    page:  isDark ? 'text-gray-200' : 'text-gray-900',
    card:  isDark ? 'bg-[#121212] border-white/8' : 'bg-white border-gray-200',
    muted: isDark ? 'text-gray-500' : 'text-gray-500',
    input: isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
    label: isDark ? 'text-gray-400' : 'text-gray-600',
  };

  function handleSalvarPerfil() {
    setSavingPerfil(true);
    setTimeout(() => {
      toast.success('Perfil atualizado');
      setSavingPerfil(false);
    }, 400);
  }

  async function handleSalvarSenha() {
    if (!senhaAtual || !novaSenha || !confirmarSenha) { toast.error('Preencha todos os campos de senha'); return; }
    if (novaSenha.length < 6) { toast.error('A nova senha deve ter pelo menos 6 caracteres'); return; }
    if (novaSenha !== confirmarSenha) { toast.error('As senhas não coincidem'); return; }
    setSavingSenha(true);
    try {
      await updatePassword(novaSenha);
      toast.success('Senha atualizada');
      setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar senha');
    } finally {
      setSavingSenha(false);
    }
  }

  function handleSelecionarCor(id: string) {
    setCorPrincipal(id);
    writeLocal('pendix_cor_principal', id);
    toast.success('Cor principal salva como preferência');
  }

  const corSelecionada = CORES.find(cr => cr.id === corPrincipal) ?? CORES[0];
  const plano = user?.plano === 'pro' ? 'Pro' : 'Normal';

  return (
    <div className={c.page}>
      <div className="mb-8">
        <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
        <h1 className="text-2xl font-black tracking-tight mt-1">Configurações</h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Perfil */}
        <div className={`rounded-2xl border p-6 ${c.card}`}>
          <div className="flex items-center gap-2 mb-5">
            <User size={15} className="text-purple-400" />
            <h2 className="text-sm font-black">Perfil</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Nome</label>
              <input value={nome} onChange={e => setNome(e.target.value)} className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`} />
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>E-mail</label>
              <input value={email} disabled className={`w-full rounded-xl border px-4 py-2.5 text-sm opacity-60 cursor-not-allowed ${c.input}`} />
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Telefone</label>
              <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-9999" className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`} />
            </div>
            <button
              onClick={handleSalvarPerfil}
              disabled={savingPerfil}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {savingPerfil ? 'Salvando...' : 'Salvar perfil'}
            </button>
          </div>
        </div>

        {/* Segurança */}
        <div className={`rounded-2xl border p-6 ${c.card}`}>
          <div className="flex items-center gap-2 mb-5">
            <Lock size={15} className="text-purple-400" />
            <h2 className="text-sm font-black">Segurança</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Senha atual</label>
              <input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} className={`w-full rounded-xl border px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`} placeholder="••••••••" />
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Nova senha</label>
              <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} className={`w-full rounded-xl border px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`} placeholder="••••••••" />
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Confirmar nova senha</label>
              <input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} className={`w-full rounded-xl border px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`} placeholder="••••••••" />
            </div>
            <button
              onClick={handleSalvarSenha}
              disabled={savingSenha}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {savingSenha ? 'Atualizando...' : 'Atualizar senha'}
            </button>
          </div>
        </div>

        {/* Aparência */}
        <div className={`rounded-2xl border p-6 ${c.card}`}>
          <div className="flex items-center gap-2 mb-5">
            <Palette size={15} className="text-purple-400" />
            <h2 className="text-sm font-black">Aparência</h2>
          </div>

          <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${c.label}`}>Tema</p>
          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              onClick={() => theme !== 'light' && toggleTheme()}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${!isDark ? 'bg-purple-600 border-purple-600 text-white' : `${c.input} ${isDark ? 'hover:border-white/20' : ''}`}`}
            >
              <Sun size={14} /> Claro
            </button>
            <button
              onClick={() => theme !== 'dark' && toggleTheme()}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${isDark ? 'bg-purple-600 border-purple-600 text-white' : c.input}`}
            >
              <Moon size={14} /> Escuro
            </button>
          </div>

          <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${c.label}`}>Cor principal</p>
          <div className="flex items-center gap-3 mb-4">
            {CORES.map(cr => (
              <button
                key={cr.id}
                onClick={() => handleSelecionarCor(cr.id)}
                title={cr.label}
                className={`relative w-9 h-9 rounded-full ${cr.className} flex items-center justify-center transition-transform hover:scale-110 ${corPrincipal === cr.id ? 'ring-2 ring-offset-2 ring-offset-transparent ring-white/60' : ''}`}
              >
                {corPrincipal === cr.id && <Check size={15} className="text-white" />}
              </button>
            ))}
          </div>
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${isDark ? 'bg-white/3 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: corSelecionada.hex }}>
              <Palette size={14} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold">Preview — {corSelecionada.label}</p>
              <p className={`text-[11px] ${c.muted}`}>Cor usada em destaques e botões principais</p>
            </div>
          </div>
        </div>

        {/* Conta */}
        <div className={`rounded-2xl border p-6 ${c.card}`}>
          <div className="flex items-center gap-2 mb-5">
            <CreditCard size={15} className="text-purple-400" />
            <h2 className="text-sm font-black">Conta</h2>
          </div>
          <div className="space-y-4">
            <div className={`rounded-xl border p-4 ${isDark ? 'bg-white/3 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
              <div className="flex items-center justify-between mb-1">
                <p className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>Plano atual</p>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border bg-purple-500/15 text-purple-400 border-purple-500/20">
                  {plano}
                </span>
              </div>
              <p className={`text-xs mt-2 ${c.muted}`}>Renovação em 15/09/2026</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => toast.info('Gestão de planos chega em breve.')}
                className="flex-1 border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-sm font-bold py-2.5 rounded-xl transition-colors"
              >
                Alterar plano
              </button>
              <button
                onClick={() => signOut()}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600/15 text-red-400 hover:bg-red-600/25 border border-red-500/20 text-sm font-bold py-2.5 rounded-xl transition-colors"
              >
                <LogOut size={14} /> Sair
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
