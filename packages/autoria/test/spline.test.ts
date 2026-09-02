import { describe, expect, it } from 'vitest';
import { buildSplineGeometry, type SplinePoint } from '../src/index.ts';

/**
 * A M7: a geometria (e o colisor) que uma pista desenhada gera. O teste trava
 * tres coisas — largura, inclinacao (banking) e laco fechado — porque sao
 * exatamente as tres promessas do README para o carro-chefe.
 */

function ponto(x: number, y: number, z: number, largura = 6, inclinacao = 0): SplinePoint {
  return { x, y, z, largura, inclinacao };
}

describe('spline de pista', () => {
  it('recusa menos de dois pontos', () => {
    expect(() => buildSplineGeometry([ponto(0, 0, 0)], false)).toThrow();
  });

  it('uma reta de dois pontos vira uma fita da largura pedida', () => {
    const { geometry, trimesh } = buildSplineGeometry(
      [ponto(0, 0, 0, 8), ponto(0, 0, 20, 8)],
      false,
      4,
    );

    // Duas bordas por amostra: a fita nunca fica mais estreita que a largura
    // pedida, em toda a extensao dela.
    const posicoes = geometry.getAttribute('position');
    for (let i = 0; i < posicoes.count; i += 2) {
      const largura = Math.hypot(
        posicoes.getX(i) - posicoes.getX(i + 1),
        posicoes.getY(i) - posicoes.getY(i + 1),
        posicoes.getZ(i) - posicoes.getZ(i + 1),
      );
      expect(largura).toBeCloseTo(8, 5);
    }

    // A malha do colisor sai do mesmo par de buffers que a geometria — "a
    // peca desenhada e a peca colidida".
    expect(trimesh.vertices.length).toBe(posicoes.count * 3);
    expect(trimesh.indices.length % 3).toBe(0);
  });

  it('a normal da fita aponta para cima numa reta sem banking', () => {
    const { geometry } = buildSplineGeometry([ponto(0, 0, 0), ponto(0, 0, 10)], false, 2);
    const normais = geometry.getAttribute('normal');
    for (let i = 0; i < normais.count; i++) {
      expect(normais.getY(i)).toBeGreaterThan(0.9);
    }
  });

  it('inclinacao desloca as bordas verticalmente na magnitude esperada', () => {
    const largura = 10;
    const inclinacao = 30;
    const { geometry } = buildSplineGeometry(
      [ponto(0, 0, 0, largura, inclinacao), ponto(0, 0, 20, largura, inclinacao)],
      false,
      2,
    );
    const posicoes = geometry.getAttribute('position');
    // No meio da pista, longe das pontas (onde a Catmull-Rom pode distorcer o
    // perfil), a diferenca de altura entre as duas bordas deve bater com
    // largura * sin(inclinacao).
    const meio = Math.floor(posicoes.count / 4) * 2;
    const dy = Math.abs(posicoes.getY(meio) - posicoes.getY(meio + 1));
    const esperado = largura * Math.sin((inclinacao * Math.PI) / 180);
    expect(dy).toBeCloseTo(esperado, 1);
  });

  it('pista fechada liga o ultimo ponto ao primeiro', () => {
    const pontos = [
      ponto(0, 0, 0),
      ponto(10, 0, 0),
      ponto(10, 0, 10),
      ponto(0, 0, 10),
    ];
    const { trimesh } = buildSplineGeometry(pontos, true, 4);
    // Fechada: o numero de quads e igual ao numero de amostras (nao amostras
    // menos um), entao ha mais triangulos do que uma pista aberta com a
    // mesma contagem de amostras.
    const abertaEquivalente = buildSplineGeometry(pontos, false, 4);
    expect(trimesh.indices.length).toBeGreaterThan(abertaEquivalente.trimesh.indices.length);
  });
});
