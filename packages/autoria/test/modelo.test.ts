import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  type Entity,
  InstancedBatch,
  loadRapier,
  ObjectRegistry,
  PhysicsWorld,
  World,
} from '@faisca/runtime';
import {
  type AssemblerHost,
  type ProvedorDeModelos,
  readScene,
  SceneAssembler,
  SceneDocument,
  writeScene,
} from '../src/index.ts';

/**
 * A peca `modelo` e a unica cujo desenho nao esta no codigo: ele vem de um
 * arquivo que a crianca importou, e chega *depois* — o no ja esta na cena
 * quando o modelo termina de abrir. O que estes testes cobrem e justamente o
 * "depois": a troca acontecer, o colisor sair da malha que chegou, e uma
 * resposta atrasada nao reaparecer numa cena que ja seguiu em frente.
 */
await loadRapier();

/** Um "modelo" de mentira: uma placa de 4x4 com o topo em Y=0. */
function placa(): THREE.Object3D {
  const geometria = new THREE.BoxGeometry(4, 1, 4);
  geometria.translate(0, -0.5, 0);
  return new THREE.Mesh(geometria, new THREE.MeshBasicMaterial());
}

class HospedeiroDeTeste implements AssemblerHost {
  readonly world = new World();
  readonly scene = new THREE.Group();
  readonly physics = new PhysicsWorld();
  private readonly registry = new ObjectRegistry(this.scene);
  carregarModelo: ProvedorDeModelos = async () => null;

  attach(entity: Entity, object: THREE.Object3D): number {
    return this.registry.attach(entity, object);
  }

  detach(entity: Entity): void {
    this.registry.detach(entity);
  }

  createBatch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ): InstancedBatch {
    return new InstancedBatch(0, geometry, material, capacity);
  }
}

let host: HospedeiroDeTeste;
let doc: SceneDocument;
let montador: SceneAssembler;

beforeEach(() => {
  host = new HospedeiroDeTeste();
  host.world.clear();
  doc = new SceneDocument('Fase');
  montador = new SceneAssembler(host, doc);
});

/** Deixa as promessas pendentes do montador terminarem. */
const assentar = () => new Promise((r) => setTimeout(r, 0));

function chaoEm(x: number, z: number): number | null {
  const batida = host.physics.castRay({ x, y: 8, z }, { x: 0, y: -1, z: 0 }, 20);
  return batida ? batida.point.y : null;
}

describe('peca modelo', () => {
  it('nasce com o marcador e sem pedir arquivo nenhum quando nao tem modelo', async () => {
    let pedidos = 0;
    host.carregarModelo = async () => {
      pedidos++;
      return null;
    };
    doc.add('modelo');
    montador.build();
    await assentar();

    expect(pedidos).toBe(0);
    expect(host.world.count).toBe(1);
  });

  it('troca o marcador pelo modelo que chegou', async () => {
    const objeto = placa();
    host.carregarModelo = async () => objeto;
    const no = doc.add('modelo', { modelo: 'assets/modelos/heroi.glb' });
    montador.build();
    await assentar();

    expect(host.scene.children).toContain(objeto);
    expect(objeto.userData.faiscaNode).toBe(no.id);
  });

  it('o colisor sai da malha do modelo, e nao da caixa do marcador', async () => {
    host.carregarModelo = async () => placa();
    doc.add('modelo', { modelo: 'm.glb', transform: { y: 3 } });
    montador.build();

    // Antes de o arquivo abrir, a peca ainda nao e uma forma: nao colide.
    expect(chaoEm(0, 0)).toBeNull();

    await assentar();
    // A placa tem o topo na origem dela, entao o chao fica na altura do no.
    expect(chaoEm(0, 0)).toBeCloseTo(3, 2);
    // E ela tem 4 de largura: fora disso nao ha chao nenhum.
    expect(chaoEm(6, 0)).toBeNull();
  });

  it('a escala do no entra no colisor do modelo', async () => {
    host.carregarModelo = async () => placa();
    doc.add('modelo', { modelo: 'm.glb', transform: { sx: 3, sy: 1, sz: 3 } });
    montador.build();
    await assentar();

    // Tres vezes mais larga: agora ha chao onde antes nao havia.
    expect(chaoEm(5, 0)).toBeCloseTo(0, 2);
  });

  it('trocar de modelo no meio do carregamento nao deixa o antigo chegar', async () => {
    const velho = placa();
    const novo = placa();
    host.carregarModelo = async (caminho) => {
      await assentar();
      return caminho === 'velho.glb' ? velho : novo;
    };

    const no = doc.add('modelo', { modelo: 'velho.glb' });
    montador.build();
    doc.setModelo(no.id, 'novo.glb');
    await assentar();
    await assentar();

    expect(host.scene.children).toContain(novo);
    expect(host.scene.children).not.toContain(velho);
  });

  it('apagar o no antes de o modelo chegar nao ressuscita nada', async () => {
    const objeto = placa();
    host.carregarModelo = async () => {
      await assentar();
      return objeto;
    };
    const no = doc.add('modelo', { modelo: 'm.glb' });
    montador.build();
    doc.remove(no.id);
    await assentar();
    await assentar();

    expect(host.scene.children).not.toContain(objeto);
    expect(host.world.count).toBe(0);
  });

  it('um modelo que nao abre vira aviso, e nao um no perdido', async () => {
    host.carregarModelo = async () => {
      throw new Error('Faísca: não achei o arquivo "sumiu.glb".');
    };
    const no = doc.add('modelo', { modelo: 'sumiu.glb' });
    montador.build();
    await assentar();

    expect(host.world.count).toBe(1);
    expect(montador.errosDeModelos()).toEqual([
      { node: no.id, mensagem: expect.stringContaining('sumiu.glb') },
    ]);
  });

  it('o aviso some quando o no e apagado', async () => {
    host.carregarModelo = async () => {
      throw new Error('nao abriu');
    };
    const no = doc.add('modelo', { modelo: 'sumiu.glb' });
    montador.build();
    await assentar();
    doc.remove(no.id);

    expect(montador.errosDeModelos()).toEqual([]);
  });
});

describe('o caminho do modelo no arquivo do projeto', () => {
  it('vai e volta sem perder o caminho', () => {
    const documento = new SceneDocument('Fase');
    documento.add('modelo', { modelo: 'assets/modelos/tails/scene.gltf' });

    const lido = readScene(writeScene(documento.toJSON()));
    expect(lido.nodes[0].modelo).toBe('assets/modelos/tails/scene.gltf');
  });

  it('quem nao tem modelo nao ganha a chave no arquivo', () => {
    const documento = new SceneDocument('Fase');
    documento.add('reta');
    expect(writeScene(documento.toJSON())).not.toContain('"modelo"');
  });

  it('copiar o no copia o modelo junto', () => {
    const no = doc.add('modelo', { modelo: 'm.glb' });
    const copia = doc.duplicate(no.id);
    expect(copia?.modelo).toBe('m.glb');
  });
});
