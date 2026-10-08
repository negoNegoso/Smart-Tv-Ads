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

  it('deixa passar os erros de limite da faixa de recados, que já vêm em português', () => {
    for (const error of ['Até 5 recados.', 'Cada recado tem até 80 caracteres.']) {
      expect(mensagemDeErro({ status: 400, data: { error } }, FALLBACK)).toBe(error);
    }
  });

  it('deixa passar o erro do link de música, que já vem em português', () => {
    const err = { status: 400, data: { error: 'Link do YouTube inválido' } };
    expect(mensagemDeErro(err, FALLBACK)).toBe('Link do YouTube inválido');
  });

  it('ignora corpo com formato inesperado', () => {
    expect(mensagemDeErro({ data: { error: 42 } }, FALLBACK)).toBe(FALLBACK);
    expect(mensagemDeErro({ data: 'texto solto' }, FALLBACK)).toBe(FALLBACK);
  });

  it('repassa o conflito de vitrine, que o servidor já escreve em português', () => {
    const err = { data: { error: 'Já existe uma vitrine vertical: Vitrine vertical' } };
    expect(mensagemDeErro(err, FALLBACK)).toBe('Já existe uma vitrine vertical: Vitrine vertical');
  });

  it('mensagem qualquer do servidor continua caindo no fallback', () => {
    expect(mensagemDeErro({ data: { error: 'Device not found' } }, FALLBACK)).toBe(FALLBACK);
  });
});
