import { describe, expect, it } from 'vitest';
import { kitInicial } from '../src/index.ts';

describe('kitInicial', () => {
  it('gera personagem, peca de pista, moeda, sons e musica', () => {
    const kit = kitInicial();
    const caminhos = kit.map((item) => item.asset.caminho);

    expect(caminhos).toEqual([
      'assets/texturas/heroi.png',
      'assets/texturas/moeda.png',
      'assets/texturas/plataforma.png',
      'assets/sons/pulo.wav',
      'assets/sons/moeda.wav',
      'assets/musicas/hub.wav',
    ]);
  });

  it('cada item ja passou pelo importador de verdade', () => {
    for (const { asset, bytes } of kitInicial()) {
      expect(asset.tamanho).toBe(bytes.length);
      expect(['textura', 'som', 'musica']).toContain(asset.tipo);
    }
  });
});
