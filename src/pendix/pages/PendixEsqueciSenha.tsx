import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Mail, ClipboardList, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../app/auth/AuthProvider';

function usePendixMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prevFavicon = favicon?.href ?? '';
    document.title = 'Pendix — Recuperar senha';
    if (favicon) favicon.href = '/pendix-favicon.svg';
    return () => {
      document.title = prevTitle;
      if (favicon) favicon.href = prevFavicon;
    };
  }, []);
}

export default function PendixEsqueciSenha() {
  usePendixMeta();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setEnviado(true);
    } catch (err) {
      setError((err as Error).message || 'Não foi possível enviar o link de recuperação.');
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
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shadow-[0_0_24px_rgba(139,92,246,0.45)]">
              <ClipboardList size={22} className="text-white" />
            </div>
            <span className="text-4xl font-black tracking-[0.12em] uppercase">PENDIX</span>
          </div>
          <p className="text-xs text-purple-400/60 tracking-[0.25em] uppercase">Gestão de Pendências</p>
        </div>

        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8 backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          {enviado ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={22} className="text-emerald-400" />
              </div>
              <h2 className="text-lg font-light text-white mb-2">Link enviado</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Enviamos um link de recuperação para <strong className="text-gray-300">{email}</strong>. Verifique sua caixa de entrada.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-light text-white mb-1">Recuperar senha</h2>
              <p className="text-xs text-gray-600 mb-8 tracking-wide">Informe seu e-mail para receber o link de redefinição</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">E-mail</label>
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
                    <>Enviar link <ArrowRight size={15} /></>
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
