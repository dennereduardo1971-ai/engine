import { describe, expect, it } from 'vitest';
import {
  CatalogoDeAssets,
  dependenciasDeModelo,
  importarAsset,
  resolverCaminho,
} from '../src/index.ts';

/** Monta um GLB minimo mas valido: cabecalho + um unico chunk JSON. */
function glb(json: unknown): Uint8Array {
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const preenchido = (jsonBytes.length + 3) & ~3;
  if (preenchido !== jsonBytes.length) {
    const comEspacos = new Uint8Array(preenchido).fill(0x20);
    comEspacos.set(jsonBytes);
    jsonBytes = comEspacos;
  }
  const total = 12 + 8 + jsonBytes.length;
  const bytes = new Uint8Array(total);
  const vista = new DataView(bytes.buffer);
  vista.setUint32(0, 0x46546c67, true);
  vista.setUint32(4, 2, true);
  vista.setUint32(8, total, true);
  vista.setUint32(12, jsonBytes.length, true);
  vista.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  return bytes;
}

function gltf(json: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(json));
}

const DOC = {
  asset: { version: '2.0' },
  buffers: [{ uri: 'scene.bin' }],
  images: [{ uri: 'textures/corpo.png' }, { uri: 'textures/olhos.png' }],
};

describe('resolverCaminho', () => {
  it('junta a pasta do modelo com o caminho relativo', () => {
    expect(resolverCaminho('assets/modelos/heroi/', 'scene.bin')).toBe(
      'assets/modelos/heroi/scene.bin',
    );
  });

  it('sobe uma pasta com ".." e engole o "./"', () => {
    expect(resolverCaminho('assets/modelos/heroi/', '../comum/./atlas.png')).toBe(
      'assets/modelos/comum/atlas.png',
    );
  });

  it('nao deixa um ".." a mais escapar da raiz', () => {
    expect(resolverCaminho('assets/', '../../../etc/senha')).toBe('etc/senha');
  });
});

describe('dependenciasDeModelo', () => {
  it('lista o .bin e as texturas de um .gltf, relativos a pasta dele', () => {
    expect(dependenciasDeModelo('assets/modelos/tails/scene.gltf', gltf(DOC))).toEqual([
      'assets/modelos/tails/scene.bin',
      'assets/modelos/tails/textures/corpo.png',
      'assets/modelos/tails/textures/olhos.png',
    ]);
  });

  it('le tambem o bloco JSON de dentro de um GLB', () => {
    expect(dependenciasDeModelo('assets/modelos/tails.glb', glb(DOC))).toEqual([
      'assets/modelos/scene.bin',
      'assets/modelos/textures/corpo.png',
      'assets/modelos/textures/olhos.png',
    ]);
  });

  it('nao conta URI "data:", que ja e o proprio conteudo', () => {
    const doc = { asset: { version: '2.0' }, buffers: [{ uri: 'data:application/octet-stream;base64,AAAA' }] };
    expect(dependenciasDeModelo('m.glb', glb(doc))).toEqual([]);
  });

  it('decodifica o escape de URI: "meu%20modelo.bin" e um arquivo com espaco', () => {
    const doc = { asset: { version: '2.0' }, buffers: [{ uri: 'meu%20modelo.bin' }] };
    expect(dependenciasDeModelo('a/b.gltf', gltf(doc))).toEqual(['a/meu modelo.bin']);
  });

  it('nao repete o mesmo arquivo apontado duas vezes', () => {
    const doc = { asset: { version: '2.0' }, images: [{ uri: 'a.png' }, { uri: './a.png' }] };
    expect(dependenciasDeModelo('m.gltf', gltf(doc))).toEqual(['a.png']);
  });

  it('devolve vazio para um formato que nao e modelo glTF', () => {
    expect(dependenciasDeModelo('assets/texturas/heroi.png', new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe('catalogo com dependencias', () => {
  it('guarda no asset o que o .gltf precisa', () => {
    const asset = importarAsset('assets/modelos/tails/scene.gltf', gltf(DOC));
    expect(asset.dependencias).toEqual([
      'assets/modelos/tails/scene.bin',
      'assets/modelos/tails/textures/corpo.png',
      'assets/modelos/tails/textures/olhos.png',
    ]);
  });

  it('nao poe o campo em quem se basta', () => {
    const asset = importarAsset('assets/modelos/tails.glb', glb({ asset: { version: '2.0' } }));
    expect(asset.dependencias).toBeUndefined();
  });

  it('faltando() conta so o que ainda nao entrou no catalogo', () => {
    const catalogo = new CatalogoDeAssets();
    catalogo.registrar('assets/modelos/tails/scene.gltf', gltf(DOC));
    expect(catalogo.faltando('assets/modelos/tails/scene.gltf')).toHaveLength(3);

    catalogo.registrar('assets/modelos/tails/scene.bin', new Uint8Array(4), { tipo: 'modelo' });
    expect(catalogo.faltando('assets/modelos/tails/scene.gltf')).toEqual([
      'assets/modelos/tails/textures/corpo.png',
      'assets/modelos/tails/textures/olhos.png',
    ]);
  });

  it('faltando() de um caminho que nem esta no catalogo e vazio', () => {
    expect(new CatalogoDeAssets().faltando('nao/existe.gltf')).toEqual([]);
  });
});
