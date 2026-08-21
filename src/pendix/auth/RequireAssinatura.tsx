import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { getAssinatura, assinaturaEmDia } from '../services/assinatura';

/**
 * Portão de assinatura: sem pagamento em dia, todas as telas do escritório
 * levam de volta para a de assinatura (requisito 9.2 — a chave é bloqueada 3
 * dias após o vencimento).
 *
 * O usuário CONTINUA logando e continua enxergando o menu. A escolha é
 * deliberada: os dados dele ficam intactos esperando do outro lado do
 * pagamento, e o caminho de volta é um clique. Derrubar o login transformaria
 * um atraso de boleto num "perdi o acesso ao sistema".
 *
 * Isto NÃO é a fronteira de segurança — é conveniência de navegação. Quem
 * protege os dados de verdade são as policies de RLS, que não dependem desta
 * tela. Alguém que force a URL não ganha nada além de ver a tela vazia.
 */

/** Telas que continuam alcançáveis com a assinatura vencida. */
const LIBERADAS = ['/pendix/app/assinatura', '/pendix/app/configuracoes'];

export function RequireAssinatura({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [emDia, setEmDia] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    getAssinatura()
      .then((a) => { if (vivo) setEmDia(assinaturaEmDia(a)); })
      // Falha de rede não pode virar bloqueio: o escritório pagante ficaria
      // trancado do lado de fora por causa de um timeout. Na dúvida, libera —
      // as policies do banco continuam valendo de qualquer forma.
      .catch(() => { if (vivo) setEmDia(true); });
    return () => { vivo = false; };
  }, []);

  // Enquanto não sabemos, não redireciona nem pisca a tela: renderiza normal.
  // Uma volta a mais na tela de pagamento incomoda menos que um flash de
  // conteúdo seguido de um pulo.
  if (emDia === null || emDia) return <>{children}</>;

  if (LIBERADAS.some((p) => location.pathname.startsWith(p))) return <>{children}</>;

  return <Navigate to="/pendix/app/assinatura" replace />;
}
