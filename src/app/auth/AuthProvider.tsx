import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import type { PlanType } from '../plan/types';

type User = {
  id: string;
  nome: string;
  email: string;
  role: string;
  officeId?: string;
  companyId?: string;
  telas?: string[];
  companyIds?: string[];
  plano?: PlanType;
  telefone?: string;
};

type AuthContextType = {
  token: string | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, senha: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  impersonatedOfficeId: string | null;
  impersonatedOfficeName: string | null;
  setImpersonatedOffice: (id: string | null, name: string | null) => void;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impersonatedOfficeId, setImpersonatedOfficeId] = useState<string | null>(() => localStorage.getItem('flash_impersonated_office_id'));
  const [impersonatedOfficeName, setImpersonatedOfficeName] = useState<string | null>(() => localStorage.getItem('flash_impersonated_office_name'));

  const setImpersonatedOffice = (id: string | null, name: string | null) => {
    setImpersonatedOfficeId(id);
    setImpersonatedOfficeName(name);
    if (id) {
      localStorage.setItem('flash_impersonated_office_id', id);
      if (name) localStorage.setItem('flash_impersonated_office_name', name);
    } else {
      localStorage.removeItem('flash_impersonated_office_id');
      localStorage.removeItem('flash_impersonated_office_name');
    }
  };

  const ROLES_VALIDOS = ['admin', 'super_admin', 'master', 'contador', 'cliente_empresa', 'acesso_completo', 'visualizador'];

  const clearAuthCache = () => {
    localStorage.removeItem('flash_token');
    localStorage.removeItem('flash_user');
  };

  const fetchUserProfile = async (userId: string, authEmail: string) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('Perfil de usuário não encontrado:', error?.message);
        clearAuthCache();
        return null;
      }

      if (!ROLES_VALIDOS.includes(data.role)) {
        console.error('Perfil de usuário com role inválida:', data.role);
        clearAuthCache();
        return null;
      }

      // Busca o plano do escritório
      let plano: PlanType = 'normal';
      if (data.escritorio_id) {
        const { data: escData } = await supabase
          .from('empresas')
          .select('plano')
          .eq('id', data.escritorio_id)
          .maybeSingle();
        if (escData?.plano === 'pro') plano = 'pro';
      }

      const profile: User = {
        id: data.id,
        nome: data.nome,
        email: authEmail,
        role: data.role,
        officeId: data.escritorio_id ?? undefined,
        companyId: data.empresa_id ?? undefined,
        telas: data.telas || ['Dashboard', 'Notas Fiscais'],
        companyIds: data.empresa_ids || [],
        plano,
        telefone: data.telefone || '',
      };

      localStorage.setItem('flash_user', JSON.stringify(profile));
      return profile;
    } catch (err) {
      console.error('Exceção ao buscar perfil:', err);
      clearAuthCache();
      return null;
    }
  };

  useEffect(() => {
    // Verificar sessão atual ao montar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchUserProfile(session.user.id, session.user.email || '').then(profile => {
          if (profile) {
            setUser(profile);
            setToken(session.access_token);
          } else {
            supabase.auth.signOut();
            setToken(null);
            setUser(null);
          }
          setLoading(false);
        });
      } else {
        // Sem sessão válida — mas pode haver token/usuário de uma sessão
        // anterior expirada ainda salvos no localStorage. Sem limpar isso
        // aqui, RequirePendixAuth deixa passar com um token morto e o app
        // fica preso em erros 401 sem nunca voltar pro login.
        setToken(null);
        setUser(null);
        clearAuthCache();
        setLoading(false);
      }
    }).catch(() => {
      clearAuthCache();
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setToken(null);
          setUser(null);
          clearAuthCache();
          setLoading(false);
        } else if (session) {
          fetchUserProfile(session.user.id, session.user.email || '').then(profile => {
            if (profile) {
              setUser(profile);
              setToken(session.access_token);
            } else {
              supabase.auth.signOut();
              setToken(null);
              setUser(null);
            }
            setLoading(false);
          });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, senha: string) => {
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (error) {
        if (error.message?.toLowerCase().includes('email not confirmed')) {
          throw new Error('E-mail não confirmado. Verifique sua caixa de entrada ou desative a confirmação no Supabase.');
        }
        if (error.message?.toLowerCase().includes('invalid login credentials')) {
          throw new Error('E-mail ou senha incorretos.');
        }
        throw new Error(error.message || 'E-mail ou senha incorretos.');
      }

      if (data.session) {
        const profile = await fetchUserProfile(
          data.session.user.id,
          data.session.user.email || ''
        );

        if (!profile) {
          await supabase.auth.signOut();
          throw new Error('Perfil de usuário inválido ou sem permissão.');
        }

        setUser(profile);
        setToken(data.session.access_token);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Não foi possível fazer login.');
      setLoading(false);
      throw err;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setToken(null);
    setUser(null);
    setImpersonatedOfficeId(null);
    setImpersonatedOfficeName(null);
    clearAuthCache();
    localStorage.removeItem('flash_impersonated_office_id');
    localStorage.removeItem('flash_impersonated_office_name');
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const refreshUser = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const profile = await fetchUserProfile(
          session.user.id,
          session.user.email || ''
        );
        setUser(profile);
      }
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      error,
      signIn,
      signOut,
      refreshUser,
      impersonatedOfficeId,
      impersonatedOfficeName,
      setImpersonatedOffice,
      resetPassword,
      updatePassword,
    }),
    [token, user, loading, error, impersonatedOfficeId, impersonatedOfficeName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
