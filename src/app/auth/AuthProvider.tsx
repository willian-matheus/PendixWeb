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
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('flash_token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('flash_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => !localStorage.getItem('flash_token'));
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

  const ROLES_VALIDOS = ['admin', 'dono_escritorio', 'contador', 'cliente_empresa', 'acesso_completo', 'visualizador'];

  const fetchUserProfile = async (userId: string, authEmail: string) => {
    try {
      // Tenta buscar da tabela usuarios
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .single();

      // Determina a fonte de dados: tabela usuarios (se válida) ou user_metadata como fallback
      let fonte: 'tabela' | 'metadata' = 'tabela';
      if (error || !data || !ROLES_VALIDOS.includes(data.role)) {
        fonte = 'metadata';
      }

      let id: string, nome: string, role: string, escritorio_id: string | null,
          empresa_id: string | null, telas: string[], empresa_ids: string[];

      if (fonte === 'tabela') {
        id            = data.id;
        nome          = data.nome;
        role          = data.role;
        escritorio_id = data.escritorio_id;
        empresa_id    = data.empresa_id;
        telas         = data.telas || ['Dashboard', 'Notas Fiscais'];
        empresa_ids   = data.empresa_ids || [];
      } else {
        // Fallback: lê do user_metadata do Supabase Auth
        const { data: authData } = await supabase.auth.getUser();
        const meta = authData?.user?.user_metadata || {};
        id            = userId;
        nome          = meta.nome || authEmail;
        role          = meta.role || 'dono_escritorio';
        escritorio_id = meta.escritorio_id || null;
        empresa_id    = meta.empresa_id || null;
        telas         = meta.telas || [
          'Dashboard','Notas Fiscais','Empresas','Usuários','Equipe',
          'Solicitações','Agendamentos','Processos','Relatórios',
          'Certificados','Chave Manual','API','Configurações','Novidades','Ajuda',
        ];
        empresa_ids   = meta.empresa_ids || [];

        // Tenta corrigir o registro na tabela em background
        if (data && !ROLES_VALIDOS.includes(data.role)) {
          supabase.from('usuarios').update({
            nome, role, escritorio_id, empresa_id, telas, empresa_ids,
          }).eq('id', userId).then(() => {});
        }
      }

      // Busca o plano do escritório
      let plano: PlanType = 'normal';
      if (escritorio_id) {
        const { data: escData } = await supabase
          .from('empresas')
          .select('plano')
          .eq('id', escritorio_id)
          .maybeSingle();
        if (escData?.plano === 'pro') plano = 'pro';
      }

      const profile: User = {
        id, nome, email: authEmail, role,
        officeId: escritorio_id ?? undefined,
        companyId: empresa_id ?? undefined,
        telas, companyIds: empresa_ids, plano,
      };

      localStorage.setItem('flash_user', JSON.stringify(profile));
      return profile;
    } catch (err) {
      console.error('Exceção ao buscar perfil:', err);
      return null;
    }
  };

  useEffect(() => {
    // Verificar sessão atual ao montar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token);
        localStorage.setItem('flash_token', session.access_token);
        fetchUserProfile(session.user.id, session.user.email || '').then(profile => {
          if (profile) setUser(profile);
          setLoading(false);
        });
      } else {
        // Sem sessão válida — mas pode haver token/usuário de uma sessão
        // anterior expirada ainda salvos no localStorage. Sem limpar isso
        // aqui, RequirePendixAuth deixa passar com um token morto e o app
        // fica preso em erros 401 sem nunca voltar pro login.
        setToken(null);
        setUser(null);
        localStorage.removeItem('flash_token');
        localStorage.removeItem('flash_user');
        setLoading(false);
      }
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setToken(null);
          setUser(null);
          localStorage.removeItem('flash_token');
          localStorage.removeItem('flash_user');
          setLoading(false);
        } else if (session) {
          setToken(session.access_token);
          localStorage.setItem('flash_token', session.access_token);
          
          // Set loading false immediately to allow navigation
          setLoading(false);

          fetchUserProfile(session.user.id, session.user.email || '').then(profile => {
            if (profile) setUser(profile);
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
        setToken(data.session.access_token);
        localStorage.setItem('flash_token', data.session.access_token);
        
        // Set loading false as soon as we have a session to speed up redirect
        setLoading(false);
        
        // Execute profile fetch in background
        fetchUserProfile(
          data.session.user.id,
          data.session.user.email || ''
        ).then(profile => {
          if (profile) setUser(profile);
        });
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
    localStorage.removeItem('flash_token');
    localStorage.removeItem('flash_user');
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
