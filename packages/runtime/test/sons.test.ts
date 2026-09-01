import { describe, expect, it } from 'vitest';
import { existeSom, SONS, silenciar, tocarSom, volumeDosSons } from '../src/index.ts';

/**
 * O banco de sons e o "e toca som" da regra-modelo da secao 7 do plano.
 *
 * Num teste em Node nao ha WebAudio, e e exatamente isso que este arquivo
 * cobra: **nao ter audio nao pode ser um erro**. Um script de peca que para no
 * meio porque o navegador nao deixou tocar um som seria trocar um efeito que
 * falta por um jogo que quebra.
 */
describe('sons', () => {
  it('a lista tem os sons que os blocos oferecem', () => {
    expect(SONS).toContain('porta');
    expect(SONS).toContain('anel');
    expect(SONS.length).toBeGreaterThan(3);
    // Sem repetidos: a lista vira um menu na tela de regras.
    expect(new Set(SONS).size).toBe(SONS.length);
  });

  it('sabe quais nomes existem', () => {
    expect(existeSom('porta')).toBe(true);
    expect(existeSom('trombone')).toBe(false);
  });

  it('sem WebAudio, tocar não toca — e também não quebra', () => {
    expect(() => tocarSom('porta')).not.toThrow();
    expect(tocarSom('porta')).toBe(false);
  });

  it('um nome que não existe é recusado, e não lançado', () => {
    expect(tocarSom('trombone')).toBe(false);
  });

  it('mexer no volume e silenciar funcionam sem contexto de áudio', () => {
    expect(() => volumeDosSons(0.3)).not.toThrow();
    expect(() => volumeDosSons(99)).not.toThrow();
    expect(() => silenciar()).not.toThrow();
    expect(tocarSom('anel')).toBe(false);
  });
});
