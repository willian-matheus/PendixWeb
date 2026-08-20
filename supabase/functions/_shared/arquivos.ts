// Sanitização de nome de arquivo vindo de fonte não confiável.
//
// Puro: sem API do Deno, sem rede — importado pelas Edge Functions e pelo
// Vitest.
//
// Motivo de existir: a whatsapp-webhook monta o caminho do storage como
// `${escritorioId}/${clienteId}/${Date.now()}-${fileName}`, e `fileName` vem
// do payload do WhatsApp — ou seja, de quem manda a mensagem. Um arquivo
// chamado `../../outro-escritorio/cliente-x/nota.pdf` produziria um caminho
// que sobe para fora da pasta do tenant.
//
// Não foi possível verificar se o Storage do Supabase normaliza `..` no key.
// Sanitizar é correto de qualquer modo: defesa em profundidade não depende de
// o andar de baixo estar certo.

/** Nome de arquivo seguro para compor caminho de storage.
 *
 *  Devolve só o nome-base, sem separador de diretório, sem controle de
 *  caractere e sem sequência capaz de subir de pasta. */
export function nomeArquivoSeguro(nome: string | null | undefined): string {
  const bruto = (nome ?? '').toString();

  // Só o basename: corta tudo até a última barra, de qualquer tipo. Faz o
  // trabalho pesado contra travessia de diretório.
  const base = bruto.split(/[/\\]/).pop() ?? '';

  const limpo = base
    // Controle e nulo primeiro: podem truncar o caminho no andar de baixo.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Allowlist: tudo que não for letra, número, ponto, hífen ou sublinhado
    // vira sublinhado. Allowlist em vez de blocklist de propósito.
    .replace(/[^A-Za-z0-9._-]/g, '_')
    // `..` sobra depois do split quando o nome é literalmente "..".
    .replace(/\.{2,}/g, '.')
    // Ponto ou hífen inicial: esconde arquivo e atrapalha CLI.
    .replace(/^[.-]+/, '');

  // Nome longo demais estoura limite de key e atrapalha log.
  const cortado = limpo.slice(0, 120);

  return cortado || 'arquivo';
}
