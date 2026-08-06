import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../app/auth/AuthProvider';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import PendixLogo from '../components/PendixLogo';
import PendixWordmark from '../components/PendixWordmark';
import PendixTagline from '../components/PendixTagline';

function usePendixMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prevFavicon = favicon?.href ?? '';
    document.title = 'Pendix';
    if (favicon) favicon.href = '/pendix/logo-icon-white.png';
    return () => {
      document.title = prevTitle;
      if (favicon) favicon.href = prevFavicon;
    };
  }, []);
}

export default function PendixLogin() {
  usePendixMeta();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const { signIn, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as any)?.from || '/pendix/app';

  useEffect(() => {
    if (!authLoading && token) {
      navigate(redirectTo, { replace: true });
    }
  }, [token, authLoading, navigate, redirectTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      await signIn(email, senha);
    } catch (err) {
      setLoginError((err as Error).message || 'Credenciais inválidas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

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
          <h2 className="text-lg font-light text-white mb-1">Bem-vindo de volta</h2>
          <p className="text-xs text-gray-600 mb-8 tracking-wide">Acesse sua conta para continuar</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-purple-500/50 focus:bg-purple-500/5 transition-all"
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-purple-500/50 focus:bg-purple-500/5 transition-all font-mono tracking-widest"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-xs leading-relaxed">
                {loginError}
              </div>
            )}

            <div className="flex justify-end -mt-1">
              <Link
                to="/pendix/esqueci-senha"
                className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors tracking-wide font-semibold"
              >
                Esqueci minha senha
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white py-3.5 rounded-xl font-bold text-sm tracking-wider transition-all hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : (
                <>Entrar no Pendix <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <p className="text-xs text-gray-600">
              Não tem uma conta?{' '}
              <Link to="/pendix/registro" className="text-purple-400 hover:text-purple-300 font-bold transition-colors">
                Criar conta
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center mt-6 text-[10px] text-gray-800 tracking-wider uppercase">
          Pendix © {new Date().getFullYear()} — Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
