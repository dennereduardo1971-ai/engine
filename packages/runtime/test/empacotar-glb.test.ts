import { describe, expect, it } from 'vitest';
import { blocosDoGlb } from '@faisca/assets';
import { empacotarGlb } from '../src/render/empacotar-glb.ts';

const VERTICES = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
const TEXTURA = new Uint8Array([1, 2, 3, 4, 5]); // não precisa ser um PNG de verdade

function doc(): Record<string, unknown> {
  return {
    asset: { version: '2.0' },
    buffers: [{ byteLength: VERTICES.length, uri: 'scene.bin' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: VERTICES.length }],
    images: [{ uri: 'textures/corpo.png' }],
  };
}

function empacotarCom(arquivos: Record<string, Uint8Array>): Record<string, unknown> {
  const glb = empacotarGlb({
    doc: doc(),
    arquivo: (uri) => arquivos[uri] ?? null,
  });
  return blocosDoGlb(glb).json as Record<string, unknown>;
}

describe('empacotarGlb', () => {
  const arquivos = { 'scene.bin': VERTICES, 'textures/corpo.png': TEXTURA };

  it('deixa um unico buffer, sem URI, com tudo dentro', () => {
    const json = empacotarCom(arquivos);
    expect(json.buffers).toEqual([{ byteLength: 44 }]); // 36 de vértices + 5 da textura, alinhado
    expect(JSON.stringify(json)).not.toContain('scene.bin');
  });

  it('transforma a textura externa num bufferView com mimeType', () => {
    const json = empacotarCom(arquivos);
    expect(json.images).toEqual([{ bufferView: 1, mimeType: 'image/png' }]);
    const vistas = json.bufferViews as { byteOffset: number; byteLength: number }[];
    expect(vistas[1]).toEqual({ buffer: 0, byteOffset: 36, byteLength: 5 });
  });

  it('poe os bytes de cada arquivo no lugar que o bufferView aponta', () => {
    const glb = empacotarGlb({
      doc: doc(),
      arquivo: (uri) => arquivos[uri as keyof typeof arquivos] ?? null,
    });
    const { binario } = blocosDoGlb(glb);
    expect(binario).not.toBeNull();
    expect(binario!.subarray(0, 36)).toEqual(VERTICES);
    expect(binario!.subarray(36, 41)).toEqual(TEXTURA);
  });

  it('diz qual arquivo faltou, em vez de gerar um modelo pela metade', () => {
    expect(() => empacotarCom({ 'scene.bin': VERTICES })).toThrow(/textures\/corpo\.png/);
  });

  it('aceita conteudo embutido em "data:" sem procurar arquivo nenhum', () => {
    const glb = empacotarGlb({
      doc: {
        asset: { version: '2.0' },
        buffers: [{ byteLength: 3, uri: 'data:application/octet-stream;base64,AQID' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 3 }],
      },
      arquivo: () => null,
    });
    expect(blocosDoGlb(glb).binario!.subarray(0, 3)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('soma o deslocamento certo quando havia mais de um buffer', () => {
    const glb = empacotarGlb({
      doc: {
        asset: { version: '2.0' },
        buffers: [{ byteLength: 4, uri: 'a.bin' }, { byteLength: 4, uri: 'b.bin' }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 4 },
          { buffer: 1, byteOffset: 0, byteLength: 4 },
        ],
      },
      arquivo: (uri) =>
        uri === 'a.bin' ? new Uint8Array([1, 1, 1, 1]) : new Uint8Array([2, 2, 2, 2]),
    });
    const json = blocosDoGlb(glb).json as { bufferViews: { buffer: number; byteOffset: number }[] };
    expect(json.bufferViews).toEqual([
      { buffer: 0, byteOffset: 0, byteLength: 4 },
      { buffer: 0, byteOffset: 4, byteLength: 4 },
    ]);
  });
});
