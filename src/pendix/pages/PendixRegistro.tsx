import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Lock, Mail, User, Phone, IdCard } from 'lucide-react';
import PendixLogo from '../components/PendixLogo';
import PendixWordmark from '../components/PendixWordmark';
import PendixTagline from '../components/PendixTagline';
import { supabase } from '../../app/services/supabase';

function usePendixMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prevFavicon = favicon?.href ?? '';
    document.title = 'Pendix — Criar conta';
    if (favicon) favicon.href = '/pendix/logo-icon-white.png';
    return () => {
      document.title = prevTitle;
      if (favicon) favicon.href = prevFavicon;
    };
  }, []);
}

const FIELD_CLASS =
  'w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-purple-500/50 focus:bg-purple-500/5 transition-all';

export default function PendixRegistro() {
  usePendixMeta();
  const navigate = useNavigate();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [documento, setDocumento] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!nome.trim() || !email.trim() || !telefone.trim() || !documento.trim() || !senha) {
      setError('Preencha todos os campos.');
      return;
    }
    if (senha.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: { nome, telefone, cpf_cnpj: documento, role: 'master' },
        },
      });
      if (signUpError) {
        if (signUpError.message?.toLowerCase().includes('already registered')) {
          throw new Error('Este e-mail já está cadastrado.');
        }
        throw new Error(signUpError.message || 'Não foi possível criar a conta.');
      }
      navigate('/pendix/login', { replace: true, state: { registrado: true } });
    } catch (err) {
      setError((err as Error).message || 'Não foi possível criar a conta.');
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <PendixLogo variant="white" size={44} />
            <PendixWordmark size={40} />
          </div>
          <PendixTagline className="text-xs text-purple-400/60">Gestão de Pendências</PendixTagline>
        </div>

        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8 backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <h2 className="text-lg font-light text-white mb-1">Criar sua conta</h2>
          <p className="text-xs text-gray-600 mb-7 tracking-wide">Comece a organizar as pendências do seu escritório</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">Nome completo</label>
              <div className="relative">
                <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                <input type="text" value={nome} onChange={e => setNome(e.target.value)} className={FIELD_CLASS} placeholder="Seu nome completo" required />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">E-mail</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={FIELD_CLASS} placeholder="seu@email.com" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">Telefone</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                  <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} className={FIELD_CLASS} placeholder="(11) 99999-9999" required />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">CPF ou CNPJ</label>
                <div className="relative">
                  <IdCard size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                  <input type="text" value={documento} onChange={e => setDocumento(e.target.value)} className={FIELD_CLASS} placeholder="000.000.000-00" required />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">Senha</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                <input type="password" value={senha} onChange={e => setSenha(e.target.value)} className={`${FIELD_CLASS} font-mono tracking-widest`} placeholder="••••••••" required />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2">Confirmar senha</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700" />
                <input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} className={`${FIELD_CLASS} font-mono tracking-widest`} placeholder="••••••••" required />
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
                <>Criar conta <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <p className="text-xs text-gray-600">
              Já possui conta?{' '}
              <Link to="/pendix/login" className="text-purple-400 hover:text-purple-300 font-bold transition-colors">
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
