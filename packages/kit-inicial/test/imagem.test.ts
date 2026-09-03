import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pngQuadradoSolido } from '../src/imagem.ts';

/** Le so o suficiente do PNG para o teste confirmar tamanho e cor. */
function decodificar(png: Uint8Array) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const largura = dv.getUint32(16, false);
  const altura = dv.getUint32(20, false);

  // Acha o chunk IDAT (assinatura 8 + IHDR 4+4+13+4 = 33 bytes antes dele).
  const idatOffset = 8 + 25;
  const idatLen = dv.getUint32(idatOffset, false);
  const idatDados = png.subarray(idatOffset + 8, idatOffset + 8 + idatLen);
  const raw = inflateSync(Buffer.from(idatDados));

  const bytesPorLinha = 1 + largura * 4;
  const pixels: [number, number, number, number][] = [];
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = y * bytesPorLinha + 1 + x * 4;
      pixels.push([raw[p], raw[p + 1], raw[p + 2], raw[p + 3]]);
    }
  }
  return { largura, altura, pixels };
}

describe('pngQuadradoSolido', () => {
  it('gera um PNG com a assinatura correta e o tamanho pedido', () => {
    const png = pngQuadradoSolido([255, 122, 41, 255], 16);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const { largura, altura } = decodificar(png);
    expect(largura).toBe(16);
    expect(altura).toBe(16);
  });

  it('todo pixel tem a cor pedida', () => {
    const cor: [number, number, number, number] = [255, 214, 61, 255];
    const { pixels } = decodificar(pngQuadradoSolido(cor, 8));
    expect(pixels).toHaveLength(64);
    for (const pixel of pixels) expect(pixel).toEqual(cor);
  });
});
