import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../app/auth/AuthProvider';
import { supabase } from '../../app/services/supabase';
import PendixLogo from '../components/PendixLogo';
import PendixWordmark from '../components/PendixWordmark';
import PendixTagline from '../components/PendixTagline';

function usePendixMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prevFavicon = favicon?.href ?? '';
    document.title = 'Pendix — Redefinir senha';
    if (favicon) favicon.href = '/pendix/logo-icon-white.png';
    return () => {
      document.title = prevTitle;
      if (favicon) favicon.href = prevFavicon;
    };
  }, []);
}

export default function PendixRedefinirSenha() {
  usePendixMeta();
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sucesso, setSucesso] = useState(false);

  // O link do e-mail de recuperação carrega um token na URL; o cliente Supabase
  // troca esse token por uma sessão automaticamente e dispara PASSWORD_RECOVERY.
  useEffect(() => {
    let settled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') { settled = true; setReady(true); }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !settled) { settled = true; setReady(true); }
    });
    const timeout = setTimeout(() => { if (!settled) setInvalid(true); }, 4000);
    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (senha.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmarSenha) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      await updatePassword(senha);
      setSucesso(true);
      setTimeout(() => navigate('/pendix/login', { replace: true }), 2500);
    } catch (err) {
      setError((err as Error).message || 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#06000f] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-purple-700/8 rounded-full blur-[130px]" />
        <div className="absolute top-1/4 left-1/3 w-[350px] h-[350px] bg-violet-600/6 rounded-full blur-[90px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <PendixLogo variant="white" size={44} />
            <PendixWordmark size={40} />
          </div>
          <PendixTagline className="text-xs text-purple-400/60">Gestão de Pendências</PendixTagline>
        </div>

        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8 backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          {invalid ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <h2 className="text-lg font-light text-white mb-2">Link inválido ou expirado</h2>
              <p className="text-xs text-gray-500 leading-relaxed mb-6">
                Solicite um novo link de recuperação de senha.
              </p>
              <Link
                to="/pendix/esqueci-senha"
                className="inline-block w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white py-3 rounded-xl font-bold text-sm tracking-wider transition-all"
              >
                Pedir novo link
              </Link>
            </div>
          ) : sucesso ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={22} className="text-emerald-400" />
              </div>
              <h2 className="text-lg font-light text-white mb-2">Senha redefinida</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Redirecionando para o login...
              </p>
            </div>
          ) : !ready ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-purple-500/50 border-t-purple-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <>
              <h2 className="text-lg font-light text-white mb-1">Redefinir senha</h2>
              <p className="text-xs text-gray-600 mb-8 tracking-wide">Escolha uma nova senha para sua conta</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">Nova senha</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                    <input
                      type="password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-purple-500/50 focus:bg-purple-500/5 transition-all"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">Confirmar nova senha</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                    <input
                      type="password"
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-purple-500/50 focus:bg-purple-500/5 transition-all"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-xs leading-relaxed">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white py-3.5 rounded-xl font-bold text-sm tracking-wider transition-all hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Redefinir senha <ArrowRight size={15} /></>
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <Link to="/pendix/login" className="text-[11px] text-gray-700 hover:text-purple-400 transition-colors tracking-wider">
              ← Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
