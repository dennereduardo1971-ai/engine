import { describe, expect, it } from 'vitest';
import { hashBytes, importarAsset } from '../src/index.ts';

function bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

describe('importarAsset', () => {
  it('reconhece PNG como textura', () => {
    const asset = importarAsset('assets/texturas/heroi.png', bytes('fake-png'), {
      agora: () => 1000,
    });
    expect(asset).toEqual({
      caminho: 'assets/texturas/heroi.png',
      tipo: 'textura',
      formato: 'png',
      hash: hashBytes(bytes('fake-png')),
      tamanho: 8,
      importadoEm: 1000,
    });
  });

  it('reconhece WAV/OGG como som por padrao', () => {
    const wav = importarAsset('assets/sons/pulo.wav', bytes('fake-wav'));
    const ogg = importarAsset('assets/sons/pulo.ogg', bytes('fake-ogg'));
    expect(wav.tipo).toBe('som');
    expect(ogg.tipo).toBe('som');
  });

  it('deixa sobrescrever o tipo para musica', () => {
    const asset = importarAsset('assets/musicas/hub.ogg', bytes('fake-musica'), {
      tipo: 'musica',
    });
    expect(asset.tipo).toBe('musica');
  });

  it('recusa formato desconhecido com mensagem em portugues', () => {
    expect(() => importarAsset('assets/documentos/roteiro.pdf', bytes('x'))).toThrow(
      /não reconheço o formato "\.pdf"/,
    );
  });

  it('reconhece um formato do plano que ainda nao tem importador', () => {
    expect(() => importarAsset('assets/modelos/heroi.glb', bytes('x'))).toThrow(
      /ainda não têm importação automática/,
    );
  });

  it('o hash muda quando o conteudo muda', () => {
    const a = importarAsset('assets/texturas/heroi.png', bytes('conteudo-1'));
    const b = importarAsset('assets/texturas/heroi.png', bytes('conteudo-2'));
    expect(a.hash).not.toBe(b.hash);
  });
});
