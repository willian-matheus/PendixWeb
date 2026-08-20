import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../app/auth/AuthProvider';
import { empresaBloqueada } from '../services/faturas';

/** Redireciona o usuário da empresa inadimplente para a tela de bloqueio.
 *
 *  Isto é EXPERIÊNCIA DE USO, não segurança. Quem de fato barra a escrita
 *  são as policies da migration 0020 e a checagem dentro da
 *  whatsapp-webhook. Aqui a pessoa entende o que houve e consegue se
 *  desbloquear sozinha, em vez de esbarrar num erro de permissão sem
 *  explicação.
 *
 *  A decisão vem do banco por RPC — a regra de carência não é
 *  reimplementada aqui. */
export function RequireAdimplente({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bloqueado, setBloqueado] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelado = false;

    // O escritório nunca é bloqueado — ele é o credor, não o devedor.
    if (!user?.companyId) {
      setBloqueado(false);
      return;
    }

    empresaBloqueada(user.companyId)
      .then((r) => { if (!cancelado) setBloqueado(r); })
      // Falha de rede não tranca ninguém: a camada que realmente protege é
      // a do banco, e negar acesso por timeout só geraria suporte.
      .catch(() => { if (!cancelado) setBloqueado(false); });

    return () => { cancelado = true; };
  }, [user?.companyId]);

  if (bloqueado === null) return null;
  if (bloqueado) return <Navigate to="/pendix/bloqueado" replace />;
  return <>{children}</>;
}
