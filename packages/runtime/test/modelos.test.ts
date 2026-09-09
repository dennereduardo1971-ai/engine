import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CarregadorDeModelos, malhaDeColisao } from '../src/index.ts';

/**
 * Um triangulo com 4 unidades de altura (de y=-1 a y=3) e 2 de largura, para
 * dar numeros redondos ao normalizar. Os vertices vao num `.bin` a parte
 * quando o teste quer o caminho do `.gltf` em texto.
 */
const VERTICES = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 3, 0]);

function documento(uriDoBuffer: string): Record<string, unknown> {
  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Heroi' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [-1, -1, 0],
        max: [1, 3, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: VERTICES.byteLength }],
    buffers: [{ byteLength: VERTICES.byteLength, uri: uriDoBuffer }],
  };
}

const BIN = new Uint8Array(VERTICES.buffer.slice(0));

function gltfTexto(): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(documento('dados/heroi.bin')));
}

/** Monta um GLB de verdade: cabecalho, chunk JSON e chunk binario. */
function glb(): Uint8Array {
  const doc = documento('');
  delete (doc.buffers as Record<string, unknown>[])[0].uri; // chunk BIN, sem URI
  let json = new TextEncoder().encode(JSON.stringify(doc));
  const jsonAlinhado = (json.length + 3) & ~3;
  if (jsonAlinhado !== json.length) {
    const espacos = new Uint8Array(jsonAlinhado).fill(0x20);
    espacos.set(json);
    json = espacos;
  }
  const binAlinhado = (BIN.length + 3) & ~3;
  const total = 12 + 8 + json.length + 8 + binAlinhado;

  const bytes = new Uint8Array(total);
  const vista = new DataView(bytes.buffer);
  vista.setUint32(0, 0x46546c67, true); // "glTF"
  vista.setUint32(4, 2, true);
  vista.setUint32(8, total, true);
  vista.setUint32(12, json.length, true);
  vista.setUint32(16, 0x4e4f534a, true); // "JSON"
  bytes.set(json, 20);
  const inicioBin = 20 + json.length;
  vista.setUint32(inicioBin, binAlinhado, true);
  vista.setUint32(inicioBin + 4, 0x004e4942, true); // "BIN\0"
  bytes.set(BIN, inicioBin + 8);
  return bytes;
}

/** Um "disco" de mentira: caminho do projeto para bytes. */
function fonteCom(arquivos: Record<string, Uint8Array>) {
  const lidos: string[] = [];
  return {
    lidos,
    fonte: async (caminho: string) => {
      lidos.push(caminho);
      return arquivos[caminho] ?? null;
    },
  };
}

describe('CarregadorDeModelos', () => {
  it('abre um .glb e devolve o objeto com a malha dentro', async () => {
    const { fonte } = fonteCom({ 'assets/modelos/heroi.glb': glb() });
    const modelo = await new CarregadorDeModelos(fonte).carregar('assets/modelos/heroi.glb');

    const objeto = modelo.instanciar();
    let malhas = 0;
    objeto.traverse((filho) => {
      if ((filho as THREE.Mesh).isMesh) malhas++;
    });
    expect(malhas).toBe(1);
    expect(modelo.animacoes).toEqual([]);
  });

  it('abre um .gltf buscando o .bin ao lado, pelo caminho do projeto', async () => {
    const { fonte, lidos } = fonteCom({
      'assets/modelos/heroi/scene.gltf': gltfTexto(),
      'assets/modelos/heroi/dados/heroi.bin': BIN,
    });
    const modelo = await new CarregadorDeModelos(fonte).carregar(
      'assets/modelos/heroi/scene.gltf',
    );

    expect(lidos).toContain('assets/modelos/heroi/dados/heroi.bin');
    const caixa = new THREE.Box3().setFromObject(modelo.instanciar());
    expect(caixa.max.y - caixa.min.y).toBeCloseTo(4, 5);
  });

  it('explica qual arquivo falta quando o .bin nao foi importado junto', async () => {
    const { fonte } = fonteCom({ 'assets/modelos/heroi/scene.gltf': gltfTexto() });
    await expect(
      new CarregadorDeModelos(fonte).carregar('assets/modelos/heroi/scene.gltf'),
    ).rejects.toThrow(/dados\/heroi\.bin/);
  });

  it('recusa um caminho que nao e modelo', async () => {
    const { fonte } = fonteCom({});
    await expect(
      new CarregadorDeModelos(fonte).carregar('assets/texturas/heroi.png'),
    ).rejects.toThrow(/\.glb ou \.gltf/);
  });

  it('avisa quando o arquivo nao esta no projeto', async () => {
    const { fonte } = fonteCom({});
    await expect(new CarregadorDeModelos(fonte).carregar('sumiu.glb')).rejects.toThrow(
      /não achei o arquivo/,
    );
  });

  it('le o mesmo caminho uma vez so, mesmo pedido duas vezes ao mesmo tempo', async () => {
    const { fonte, lidos } = fonteCom({ 'heroi.glb': glb() });
    const carregador = new CarregadorDeModelos(fonte);
    await Promise.all([carregador.carregar('heroi.glb'), carregador.carregar('heroi.glb')]);
    expect(lidos.filter((c) => c === 'heroi.glb')).toHaveLength(1);
  });

  it('le de novo depois de invalidar — o arquivo mudou no disco', async () => {
    const { fonte, lidos } = fonteCom({ 'heroi.glb': glb() });
    const carregador = new CarregadorDeModelos(fonte);
    await carregador.carregar('heroi.glb');
    carregador.invalidar('heroi.glb');
    await carregador.carregar('heroi.glb');
    expect(lidos.filter((c) => c === 'heroi.glb')).toHaveLength(2);
  });

  it('nao guarda o erro no cache: o arquivo pode chegar depois', async () => {
    const arquivos: Record<string, Uint8Array> = {};
    const carregador = new CarregadorDeModelos(async (caminho) => arquivos[caminho] ?? null);
    await expect(carregador.carregar('heroi.glb')).rejects.toThrow();
    arquivos['heroi.glb'] = glb();
    await expect(carregador.carregar('heroi.glb')).resolves.toBeDefined();
  });

  it('reescala para a altura pedida e apoia a base no chao', async () => {
    const { fonte } = fonteCom({ 'heroi.glb': glb() });
    const modelo = await new CarregadorDeModelos(fonte).carregar('heroi.glb', {
      alturaAlvo: 2,
      assentar: true,
    });

    const caixa = new THREE.Box3().setFromObject(modelo.instanciar());
    expect(caixa.max.y - caixa.min.y).toBeCloseTo(2, 4);
    expect(caixa.min.y).toBeCloseTo(0, 4);
    expect(caixa.getCenter(new THREE.Vector3()).x).toBeCloseTo(0, 4);
  });

  it('cada copia e um objeto novo, mas divide a geometria', async () => {
    const { fonte } = fonteCom({ 'heroi.glb': glb() });
    const modelo = await new CarregadorDeModelos(fonte).carregar('heroi.glb');
    const a = modelo.instanciar();
    const b = modelo.instanciar();
    expect(a).not.toBe(b);

    const malhaDe = (raiz: THREE.Object3D): THREE.Mesh => {
      let achada: THREE.Mesh | null = null;
      raiz.traverse((filho) => {
        if ((filho as THREE.Mesh).isMesh) achada ??= filho as THREE.Mesh;
      });
      if (!achada) throw new Error('sem malha');
      return achada;
    };
    expect(malhaDe(a).geometry).toBe(malhaDe(b).geometry);
  });
});

describe('malhaDeColisao', () => {
  it('junta as malhas do modelo com a matriz de cada uma ja aplicada', async () => {
    const { fonte } = fonteCom({ 'heroi.glb': glb() });
    const modelo = await new CarregadorDeModelos(fonte).carregar('heroi.glb', {
      alturaAlvo: 2,
      assentar: true,
    });

    const malha = malhaDeColisao(modelo.instanciar());
    expect(malha).not.toBeNull();
    expect(malha!.vertices).toHaveLength(9);
    expect(malha!.indices).toEqual(new Uint32Array([0, 1, 2]));

    // O modelo foi assentado: nenhum vertice abaixo do chao, e o mais alto
    // esta na altura pedida.
    const ys = [malha!.vertices[1], malha!.vertices[4], malha!.vertices[7]];
    expect(Math.min(...ys)).toBeCloseTo(0, 4);
    expect(Math.max(...ys)).toBeCloseTo(2, 4);
  });

  it('devolve null para um objeto sem malha nenhuma', () => {
    expect(malhaDeColisao(new THREE.Group())).toBeNull();
  });

  it('respeita a posicao de cada malha dentro do grupo', () => {
    const grupo = new THREE.Group();
    const malha = new THREE.Mesh(new THREE.BufferGeometry());
    malha.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    malha.position.set(10, 0, 0);
    grupo.add(malha);

    const colisao = malhaDeColisao(grupo);
    expect(colisao!.vertices[0]).toBeCloseTo(10, 5);
    expect(colisao!.vertices[3]).toBeCloseTo(11, 5);
  });
});
