import * as THREE from 'three';
import {
  componentRegistry,
  defineSystem,
  type Entity,
  type InstancedBatch,
  placeAt,
  type System,
  Transform,
  type World,
} from '@faisca/runtime';
import {
  FollowCamera,
  makeFollowCamera,
  makeSpeedCharacter,
  SpeedCharacter,
} from '@faisca/kit-velocidade';
import { type SceneChange, type SceneDocument, type SceneNode } from './documento.ts';
import {
  type Piece,
  pieceGeometry,
  pieceOrPlaceholder,
  type Placement,
  surfaceHeightAt,
} from './pecas.ts';
import { worldPlacement, yawQuaternion } from './transformacoes.ts';

/**
 * O montador: pega o documento de cena e faz dele um mundo vivo.
 *
 * Ele e a fronteira entre editar e rodar. De um lado, uma arvore de nos com
 * valores; do outro, entidades do ECS e objetos do Three.js. E, no meio, a
 * promessa da secao 8 do plano: **mudar um valor e ver o efeito sem reiniciar
 * a fase**. Por isso ele escuta o documento e corrige so o que mudou — mover
 * uma peca mexe numa matriz, e nao remonta a fase.
 *
 * Ele fala com um "hospedeiro" e nao com a `Engine` inteira. Assim o editor
 * passa a engine de verdade e o teste passa uma cena pelada, sem WebGL.
 */
export interface AssemblerHost {
  readonly world: World;
  readonly scene: THREE.Object3D;
  attach(entity: Entity, object: THREE.Object3D): number;
  detach(entity: Entity): void;
  createBatch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ): InstancedBatch;
}

interface Built {
  node: string;
  entity: Entity;
  piece: Piece;
  object: THREE.Object3D | null;
  batch: InstancedBatch | null;
}

/** Onde o personagem nasce quando o teste comeca. */
export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const CAPACIDADE_PADRAO = 4_000;
/** Degrau que o personagem sobe sozinho ao andar. */
const DEGRAU = 1;

export class SceneAssembler {
  private readonly built = new Map<string, Built>();
  private readonly byEntity = new Map<Entity, string>();
  private readonly batches = new Map<string, InstancedBatch>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly placements: Placement[] = [];
  private placementsStale = true;
  private unsubscribe: (() => void) | null = null;

  /** Personagem do teste ao vivo, ou -1 fora do teste. */
  hero: Entity = -1;
  cameraEntity: Entity = -1;

  constructor(
    private readonly host: AssemblerHost,
    private readonly document: SceneDocument,
  ) {}

  /** Monta a cena inteira e passa a acompanhar o documento. */
  build(): void {
    this.clear();
    for (const node of this.document.nodes) this.create(node);
    this.unsubscribe ??= this.document.on((change) => this.apply(change));
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopPlay();
    this.clear();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  entityOf(nodeId: string): Entity | undefined {
    return this.built.get(nodeId)?.entity;
  }

  nodeOf(entity: Entity): string | undefined {
    return this.byEntity.get(entity);
  }

  objectOf(nodeId: string): THREE.Object3D | null {
    return this.built.get(nodeId)?.object ?? null;
  }

  /** Objetos que o clique do viewport pode acertar. */
  pickables(): THREE.Object3D[] {
    const saida: THREE.Object3D[] = [];
    for (const item of this.built.values()) if (item.object) saida.push(item.object);
    for (const batch of this.batches.values()) if (batch.count > 0) saida.push(batch.mesh);
    return saida;
  }

  /** Do que o raycaster acertou para o no da arvore. */
  nodeAtHit(hit: THREE.Intersection): string | null {
    const objeto = hit.object;
    if (objeto instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      for (const batch of this.batches.values()) {
        if (batch.mesh !== objeto) continue;
        const entidade = batch.entityAt(hit.instanceId);
        return entidade === undefined ? null : (this.byEntity.get(entidade) ?? null);
      }
      return null;
    }
    const nome = objeto.userData.faiscaNode;
    return typeof nome === 'string' ? nome : null;
  }

  /**
   * Altura do chao em (x, z), sem passar de `teto`.
   *
   * O teto e o que impede o personagem de ser colado no topo de uma
   * plataforma que esta acima da cabeca dele. Nao ha parede nem teto de
   * verdade: isso chega com o Rapier na M2.
   */
  groundHeight(x: number, z: number, teto = Number.POSITIVE_INFINITY): number {
    this.refreshPlacements();
    let melhor = 0;
    for (const place of this.placements) {
      const altura = surfaceHeightAt(place, x, z);
      if (altura === null || altura > teto) continue;
      if (altura > melhor) melhor = altura;
    }
    return melhor;
  }

  /** Onde o ponto de partida esta. Sem ele, a origem. */
  spawnPoint(): SpawnPoint {
    const node = this.document.firstOfPiece('inicio');
    if (!node) return { x: 0, y: 0, z: 0, yaw: 0 };
    const place = worldPlacement(this.document, node);
    return { x: place.x, y: place.y, z: place.z, yaw: place.yaw };
  }

  // --- Teste ao vivo --------------------------------------------------------

  /**
   * Poe o personagem na fase. Os deslizadores dele vem do no do ponto de
   * partida — e por isso mexer neles com o jogo rodando muda o personagem na
   * hora, sem reiniciar.
   */
  startPlay(): Entity {
    this.stopPlay();
    const partida = this.spawnPoint();
    const node = this.document.firstOfPiece('inicio');

    const hero = this.host.world.create();
    placeAt(hero, partida.x, partida.y + 0.2, partida.z);
    const slot = makeSpeedCharacter(hero);
    SpeedCharacter.fields.yaw[slot] = partida.yaw;
    if (node) applyFieldsTo(hero, node.fields.SpeedCharacter, SpeedCharacter.name);
    this.host.attach(hero, heroObject());

    const camera = this.host.world.create();
    const cameraSlot = makeFollowCamera(camera, hero);
    FollowCamera.fields.yaw[cameraSlot] = partida.yaw;
    if (node) applyFieldsTo(camera, node.fields.FollowCamera, FollowCamera.name);

    this.hero = hero;
    this.cameraEntity = camera;
    return hero;
  }

  stopPlay(): void {
    if (this.hero >= 0) {
      this.host.detach(this.hero);
      this.host.world.destroy(this.hero);
      this.hero = -1;
    }
    if (this.cameraEntity >= 0) {
      this.host.world.destroy(this.cameraEntity);
      this.cameraEntity = -1;
    }
  }

  get playing(): boolean {
    return this.hero >= 0;
  }

  /**
   * Sistema que apoia o personagem nas pecas.
   *
   * Provisorio e assumido: ele so escreve a altura do chao debaixo do
   * personagem, o que ja da para subir rampa, ficar em pe na plataforma e cair
   * da beirada. Parede, teto e superficie grudenta sao Rapier, e sao a M2 —
   * quando ela chegar, este sistema sai inteiro e o `groundY` do personagem
   * sai junto.
   */
  groundSystem(): System {
    return defineSystem({
      name: 'ChaoDasPecas',
      phase: 'logic',
      // Antes do personagem (que roda em -20): a altura tem que estar escrita
      // quando ele for decidir se esta no chao.
      order: -30,
      update: () => {
        if (this.hero < 0) return;
        const ts = Transform.slotOf(this.hero);
        const cs = SpeedCharacter.slotOf(this.hero);
        if (ts < 0 || cs < 0) return;
        const t = Transform.fields;
        SpeedCharacter.fields.groundY[cs] = this.groundHeight(
          t.x[ts],
          t.z[ts],
          t.y[ts] + DEGRAU,
        );
      },
    });
  }

  // --- Reagir ao documento --------------------------------------------------

  private apply(change: SceneChange): void {
    switch (change.kind) {
      case 'add': {
        const node = this.document.get(change.id);
        if (node) this.create(node);
        break;
      }
      case 'remove':
        this.destroy(change.id);
        break;
      case 'transform':
      case 'parent':
        // Mover o pai move o galho inteiro.
        for (const node of this.document.branch(change.id)) this.place(node);
        this.placementsStale = true;
        break;
      case 'fields':
        this.applyFields(change.id, change.component);
        break;
      case 'appearance': {
        // Cor e visibilidade mexem no material e na vaga do lote: refazer o
        // objeto e mais simples (e igualmente rapido) do que remendar os dois.
        const node = this.document.get(change.id);
        this.destroy(change.id);
        if (node) this.create(node);
        break;
      }
      case 'name':
        break;
      case 'reload':
        this.build();
        break;
    }
  }

  private create(node: SceneNode): void {
    if (this.built.has(node.id)) this.destroy(node.id);
    const piece = pieceOrPlaceholder(node.piece);
    const entity = this.host.world.create();
    const built: Built = { node: node.id, entity, piece, object: null, batch: null };

    if (piece.mesh.kind !== 'grupo' && node.visible) {
      if (piece.instanced) {
        const batch = this.batchFor(piece);
        if (batch.claim(entity) >= 0) built.batch = batch;
      } else {
        const objeto = new THREE.Mesh(pieceGeometry(piece), this.materialFor(piece, node.color));
        objeto.userData.faiscaNode = node.id;
        this.host.attach(entity, objeto);
        built.object = objeto;
      }
    }

    this.built.set(node.id, built);
    this.byEntity.set(entity, node.id);
    this.place(node);
    this.applyFields(node.id, null);
    this.placementsStale = true;
  }

  private destroy(nodeId: string): void {
    const built = this.built.get(nodeId);
    if (!built) return;
    built.batch?.release(built.entity);
    if (built.object) this.host.detach(built.entity);
    this.host.world.destroy(built.entity);
    this.byEntity.delete(built.entity);
    this.built.delete(nodeId);
    this.placementsStale = true;
  }

  /** Escreve a posicao de mundo do no no Transform da entidade. */
  private place(node: SceneNode): void {
    const built = this.built.get(node.id);
    if (!built) return;
    const place = worldPlacement(this.document, node);
    let ts = Transform.slotOf(built.entity);
    if (ts < 0) ts = placeAt(built.entity, place.x, place.y, place.z);
    const f = Transform.fields;
    const giro = yawQuaternion(place.yaw);
    // Passo anterior junto com o atual: uma peca movida no editor tem que
    // aparecer no lugar novo, e nao riscar a tela desde o lugar velho.
    f.x[ts] = f.px[ts] = place.x;
    f.y[ts] = f.py[ts] = place.y;
    f.z[ts] = f.pz[ts] = place.z;
    f.qx[ts] = f.pqx[ts] = giro.x;
    f.qy[ts] = f.pqy[ts] = giro.y;
    f.qz[ts] = f.pqz[ts] = giro.z;
    f.qw[ts] = f.pqw[ts] = giro.w;
    f.sx[ts] = place.sx;
    f.sy[ts] = place.sy;
    f.sz[ts] = place.sz;
  }

  /**
   * Leva os valores editados para os componentes vivos. E aqui que o hot
   * reload acontece de verdade: o campo mudou no documento, e o componente que
   * o sistema vai ler no proximo passo ja esta com o valor novo.
   */
  private applyFields(nodeId: string, component: string | null): void {
    const node = this.document.get(nodeId);
    if (!node) return;

    // O ponto de partida guarda os deslizadores do personagem e da camera, que
    // moram em outras entidades — as do teste, que so existem enquanto joga.
    if (node.piece === 'inicio') {
      if (this.hero >= 0 && (component === null || component === SpeedCharacter.name)) {
        applyFieldsTo(this.hero, node.fields.SpeedCharacter, SpeedCharacter.name);
      }
      if (this.cameraEntity >= 0 && (component === null || component === FollowCamera.name)) {
        applyFieldsTo(this.cameraEntity, node.fields.FollowCamera, FollowCamera.name);
      }
      return;
    }

    const built = this.built.get(nodeId);
    if (!built) return;
    for (const [nome, valores] of Object.entries(node.fields)) {
      if (component !== null && nome !== component) continue;
      applyFieldsTo(built.entity, valores, nome);
    }
  }

  private refreshPlacements(): void {
    if (!this.placementsStale) return;
    this.placementsStale = false;
    this.placements.length = 0;
    for (const node of this.document.nodes) {
      const piece = pieceOrPlaceholder(node.piece);
      if (piece.surface === 'nenhuma' || !node.visible) continue;
      const place = worldPlacement(this.document, node);
      this.placements.push({ piece, ...place });
    }
  }

  private batchFor(piece: Piece): InstancedBatch {
    const existente = this.batches.get(piece.id);
    if (existente) return existente;
    const batch = this.host.createBatch(
      // Uma copia: o lote se desfaz da propria geometria quando a engine
      // fecha, e ela nao pode ser a que o cache das pecas empresta a todo
      // mundo.
      pieceGeometry(piece).clone(),
      this.materialFor(piece, null),
      piece.capacity ?? CAPACIDADE_PADRAO,
    );
    this.batches.set(piece.id, batch);
    return batch;
  }

  /**
   * Um material por cor. Cor propria so vale em peca nao instanciada: quem
   * esta num lote divide o material com todo mundo do lote, que e justamente o
   * que faz o lote ser uma chamada de desenho so.
   */
  private materialFor(piece: Piece, color: number | null): THREE.Material {
    const cor = piece.instanced ? piece.color : (color ?? piece.color);
    const chave = `${piece.id}:${cor}`;
    const existente = this.materials.get(chave);
    if (existente) return existente;
    const material = new THREE.MeshLambertMaterial({
      color: cor,
      emissive: piece.id === 'anel' ? 0x3a2a00 : 0x000000,
      // A curva e uma casca fina: sem os dois lados, ela some vista de baixo.
      side: piece.mesh.kind === 'curva' ? THREE.DoubleSide : THREE.FrontSide,
    });
    this.materials.set(chave, material);
    return material;
  }

  private clear(): void {
    for (const nodeId of [...this.built.keys()]) this.destroy(nodeId);
    for (const batch of this.batches.values()) batch.clear();
    this.placementsStale = true;
  }
}

/** Escreve valores num componente pelo nome, se a entidade tiver o componente. */
function applyFieldsTo(
  entity: Entity,
  values: Record<string, number> | undefined,
  componentName: string,
): void {
  if (!values) return;
  const component = componentRegistry.find((candidate) => candidate.name === componentName);
  if (!component) return;
  const slot = component.slotOf(entity);
  if (slot < 0) return;
  const fields = component.fields as Record<string, { [index: number]: number } | undefined>;
  for (const [campo, valor] of Object.entries(values)) {
    const array = fields[campo];
    if (array && Number.isFinite(valor)) array[slot] = valor;
  }
}

let heroCache: THREE.Object3D | null = null;

/**
 * O bonequinho do teste: uma capsula e um bico para ver para onde ele olha.
 *
 * Feito uma vez so e reaproveitado: dar play e parar dezenas de vezes seguidas
 * enquanto se acerta uma fase nao pode ir deixando malhas orfas na memoria.
 */
export function heroObject(): THREE.Object3D {
  if (heroCache) return heroCache;
  const corpo = new THREE.Group();
  const capsula = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.1, 4, 12),
    new THREE.MeshLambertMaterial({ color: 0x4f7cff }),
  );
  capsula.position.y = 1.1;
  corpo.add(capsula);
  const bico = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.6, 10),
    new THREE.MeshLambertMaterial({ color: 0xffd166 }),
  );
  bico.rotation.x = Math.PI / 2;
  bico.position.set(0, 1.2, 0.62);
  corpo.add(bico);
  heroCache = corpo;
  return corpo;
}
