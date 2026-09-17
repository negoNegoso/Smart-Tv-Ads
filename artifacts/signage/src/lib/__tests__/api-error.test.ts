import { describe, expect, it } from 'vitest';
import { mensagemDeErro } from '../api-error';

/**
 * O toast de adicionar à playlist dizia "Já está na playlist ou falhou" para
 * QUALQUER falha — inclusive erro de servidor. Quem via a mensagem procurava
 * duplicata onde havia outro defeito.
 *
 * A regra aqui é estreita de propósito: só a duplicata, que o servidor nomeia,
 * vira frase específica. Todo o resto cai no fallback em português — mensagem
 * de servidor em inglês não vai para a tela do usuário.
 */
describe('mensagemDeErro', () => {
  const FALLBACK = 'Não foi possível adicionar à playlist.';

  it('nomeia a duplicata quando o servidor a identifica', () => {
    const err = { status: 400, data: { error: 'Announcement already in playlist' } };
    expect(mensagemDeErro(err, FALLBACK)).toBe('Essa peça já está na playlist.');
  });

  it('não chama de duplicata um erro de servidor', () => {
    const err = { status: 500, data: null };
    expect(mensagemDeErro(err, FALLBACK)).toBe(FALLBACK);
  });

  it('não vaza mensagem de servidor em inglês', () => {
    const err = { status: 400, data: { error: 'Device not found' } };
    expect(mensagemDeErro(err, FALLBACK)).toBe(FALLBACK);
  });

  it('aguenta erro sem corpo', () => {
    expect(mensagemDeErro(new Error('rede caiu'), FALLBACK)).toBe(FALLBACK);
    expect(mensagemDeErro(null, FALLBACK)).toBe(FALLBACK);
    expect(mensagemDeErro(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it('ignora corpo com formato inesperado', () => {
    expect(mensagemDeErro({ data: { error: 42 } }, FALLBACK)).toBe(FALLBACK);
    expect(mensagemDeErro({ data: 'texto solto' }, FALLBACK)).toBe(FALLBACK);
  });
});
