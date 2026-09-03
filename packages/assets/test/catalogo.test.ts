import { describe, expect, it } from 'vitest';
import { CatalogoDeAssets } from '../src/index.ts';

function bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

describe('CatalogoDeAssets', () => {
  it('marca a primeira importacao como mudanca', () => {
    const catalogo = new CatalogoDeAssets();
    const { mudou } = catalogo.registrar('assets/texturas/heroi.png', bytes('v1'));
    expect(mudou).toBe(true);
    expect(catalogo.listar()).toHaveLength(1);
  });

  it('reimportar o mesmo conteudo nao conta como mudanca', () => {
    const catalogo = new CatalogoDeAssets();
    catalogo.registrar('assets/texturas/heroi.png', bytes('v1'));
    const { mudou } = catalogo.registrar('assets/texturas/heroi.png', bytes('v1'));
    expect(mudou).toBe(false);
  });

  it('reimportar com conteudo diferente conta como mudanca', () => {
    const catalogo = new CatalogoDeAssets();
    catalogo.registrar('assets/texturas/heroi.png', bytes('v1'));
    const { mudou, asset } = catalogo.registrar('assets/texturas/heroi.png', bytes('v2'));
    expect(mudou).toBe(true);
    expect(asset.tamanho).toBe(2);
  });

  it('removerAusentes tira do catalogo o que sumiu do disco', () => {
    const catalogo = new CatalogoDeAssets();
    catalogo.registrar('assets/texturas/heroi.png', bytes('v1'));
    catalogo.registrar('assets/sons/pulo.wav', bytes('v1'));

    const removidos = catalogo.removerAusentes(['assets/sons/pulo.wav']);

    expect(removidos).toEqual(['assets/texturas/heroi.png']);
    expect(catalogo.obter('assets/texturas/heroi.png')).toBeUndefined();
    expect(catalogo.obter('assets/sons/pulo.wav')).toBeDefined();
  });

  it('remover tira um asset especifico', () => {
    const catalogo = new CatalogoDeAssets();
    catalogo.registrar('assets/texturas/heroi.png', bytes('v1'));
    expect(catalogo.remover('assets/texturas/heroi.png')).toBe(true);
    expect(catalogo.remover('assets/texturas/heroi.png')).toBe(false);
  });
});
