import { describe, expect, it } from 'vitest';
import { hashBytes, importarAsset } from '../src/index.ts';

function bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

/** Um GLB minimo mas valido, so para testar que o pipeline aceita o formato. */
function glbValido(): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' } }));
  const preenchido = (json.length + 3) & ~3;
  const jsonBytes = new Uint8Array(preenchido).fill(0x20);
  jsonBytes.set(json);

  const tamanhoTotal = 12 + 8 + jsonBytes.length;
  const glb = new Uint8Array(tamanhoTotal);
  const vista = new DataView(glb.buffer);
  vista.setUint32(0, 0x46546c67, true);
  vista.setUint32(4, 2, true);
  vista.setUint32(8, tamanhoTotal, true);
  vista.setUint32(12, jsonBytes.length, true);
  vista.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonBytes, 20);
  return glb;
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
    expect(() => importarAsset('assets/modelos/heroi.blend', bytes('x'))).toThrow(
      /ainda não têm importação automática/,
    );
  });

  it('reconhece GLB como modelo, validando a estrutura do arquivo', () => {
    const glb = glbValido();
    const asset = importarAsset('assets/modelos/heroi.glb', glb);
    expect(asset.tipo).toBe('modelo');
    expect(asset.formato).toBe('glb');
  });

  it('recusa um GLB corrompido com mensagem em portugues', () => {
    expect(() => importarAsset('assets/modelos/heroi.glb', bytes('nao-e-um-glb'))).toThrow(
      /GLB inválido/,
    );
  });

  it('o hash muda quando o conteudo muda', () => {
    const a = importarAsset('assets/texturas/heroi.png', bytes('conteudo-1'));
    const b = importarAsset('assets/texturas/heroi.png', bytes('conteudo-2'));
    expect(a.hash).not.toBe(b.hash);
  });
});
