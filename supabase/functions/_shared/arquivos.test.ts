import { describe, it, expect } from 'vitest';
import { nomeArquivoSeguro } from './arquivos';

describe('nomeArquivoSeguro', () => {
  it('deixa nome comum intacto', () => {
    expect(nomeArquivoSeguro('nota-fiscal_2026.xml')).toBe('nota-fiscal_2026.xml');
  });

  // O caso que motivou esta função: fileName vem do payload do WhatsApp.
  it('impede travessia de diretorio com ../', () => {
    const r = nomeArquivoSeguro('../../outro-escritorio/cliente-x/nota.pdf');
    expect(r).toBe('nota.pdf');
    expect(r).not.toContain('/');
    expect(r).not.toContain('..');
  });

  it('impede travessia com barra invertida do Windows', () => {
    const r = nomeArquivoSeguro('..\\..\\outro\\nota.pdf');
    expect(r).toBe('nota.pdf');
    expect(r).not.toContain('\\');
  });

  it('impede caminho absoluto', () => {
    expect(nomeArquivoSeguro('/etc/passwd')).toBe('passwd');
  });

  it('neutraliza nome que e so pontos', () => {
    expect(nomeArquivoSeguro('..')).toBe('arquivo');
    expect(nomeArquivoSeguro('.')).toBe('arquivo');
  });

  it('remove byte nulo e caractere de controle', () => {
    expect(nomeArquivoSeguro('nota\u0000.pdf\u001f')).toBe('nota.pdf');
  });

  it('troca caractere fora da allowlist por sublinhado', () => {
    expect(nomeArquivoSeguro('nota fiscal (1).pdf')).toBe('nota_fiscal__1_.pdf');
  });

  it('nao deixa arquivo oculto por ponto inicial', () => {
    expect(nomeArquivoSeguro('.env')).toBe('env');
  });

  it('nao deixa nome comecando com hifen', () => {
    expect(nomeArquivoSeguro('-rf.pdf')).toBe('rf.pdf');
  });

  it('corta nome absurdamente longo', () => {
    const r = nomeArquivoSeguro('a'.repeat(500) + '.pdf');
    expect(r.length).toBeLessThanOrEqual(120);
  });

  it('devolve fallback para vazio, nulo e indefinido', () => {
    expect(nomeArquivoSeguro('')).toBe('arquivo');
    expect(nomeArquivoSeguro(null)).toBe('arquivo');
    expect(nomeArquivoSeguro(undefined)).toBe('arquivo');
  });

  it('nunca devolve algo com separador, seja qual for a entrada', () => {
    const entradas = [
      '../x', '..\\x', 'a/b/c', 'C:\\Windows\\system32\\cmd.exe',
      '....//....//x', '%2e%2e/x', 'nome/../../..',
    ];
    for (const e of entradas) {
      const r = nomeArquivoSeguro(e);
      expect(r).not.toMatch(/[/\\]/);
      expect(r).not.toContain('..');
    }
  });
});
