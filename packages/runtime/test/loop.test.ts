import { describe, expect, it } from 'vitest';
import { DEFAULT_STEP, Loop } from '../src/loop/loop.ts';

function criarLaco(opcoes: { maxCatchUp?: number } = {}) {
  const passos: number[] = [];
  const alphas: number[] = [];
  const laco = new Loop({
    maxCatchUp: opcoes.maxCatchUp,
    now: () => 0,
    request: () => 0,
    cancel: () => {},
    onFixed: (passo) => passos.push(passo),
    onRender: (alpha) => alphas.push(alpha),
  });
  return { laco, passos, alphas };
}

describe('laco de passo fixo', () => {
  it('da o numero certo de passos para o tempo que passou', () => {
    const { laco, passos } = criarLaco();
    laco.advance(50); // 50 ms = 3 passos de 16,6 ms
    expect(passos.length).toBe(3);
    expect(laco.elapsed).toBeCloseTo(3 * DEFAULT_STEP, 5);
  });

  it('entra em camera lenta em vez de acumular divida', () => {
    // Um quadro de 100 ms vale 6 passos, mas o teto e 5. O passo que sobrou e
    // descartado de proposito: tentar recuperar o tempo perdido no quadro
    // seguinte so faria ele demorar mais ainda.
    const { laco, passos } = criarLaco({ maxCatchUp: 5 });
    laco.advance(100);
    expect(passos.length).toBe(5);
    laco.advance(117); // um quadro normal depois do tranco
    expect(passos.length).toBe(6);
  });

  it('guarda o resto de um quadro para o proximo', () => {
    const { laco, passos } = criarLaco();
    laco.advance(10); // menos que um passo: simulacao nao anda
    expect(passos.length).toBe(0);
    laco.advance(20); // 20 ms no total: fecha um passo
    expect(passos.length).toBe(1);
  });

  it('desenha um quadro mesmo sem passo de simulacao', () => {
    const { laco, alphas } = criarLaco();
    laco.advance(5);
    expect(alphas.length).toBe(1);
  });

  it('entrega alpha entre 0 e 1', () => {
    const { laco, alphas } = criarLaco();
    for (let t = 10; t <= 200; t += 7) laco.advance(t);
    for (const alpha of alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('nao entra na espiral da morte depois de um travamento longo', () => {
    // Uma aba em segundo plano por 5 segundos daria 300 passos de uma vez.
    const { laco, passos } = criarLaco({ maxCatchUp: 5 });
    laco.advance(5_000);
    expect(passos.length).toBe(5);
  });

  it('ignora relogio andando para tras', () => {
    const { laco, passos } = criarLaco();
    laco.advance(100);
    const antes = passos.length;
    laco.advance(50);
    expect(passos.length).toBe(antes);
  });
});
