import * as THREE from 'three';
import {
  type Collider,
  componentRegistry,
  type Entity,
  type InstancedBatch,
  type PhysicsWorld,
  placeAt,
  Transform,
  type World,
} from '@faisca/runtime';
import {
  FollowCamera,
  makeFollowCamera,
  makeSpeedCharacter,
  resetTrackToys,
  SpeedCharacter,
} from '@faisca/kit-velocidade';
import { resetPatrollers } from '@faisca/kit-inimigos';
import { type SceneChange, type SceneDocument, type SceneNode } from './documento.ts';
import { type Piece, pieceGeometry, pieceOrPlaceholder, scaledTrimesh } from './pecas.ts';
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
  /** O mundo de colisao, ou null numa engine sem fisica. */
  readonly physics: PhysicsWorld | null;
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
  /** Colisor da peca no Rapier, quando ela e solida. */
  collider: Collider | null;
}

/** Onde o personagem nasce quando o teste comeca. */
export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const CAPACIDADE_PADRAO = 4_000;

export class SceneAssembler {
  private readonly built = new Map<string, Built>();
  private readonly byEntity = new Map<Entity, string>();
  private readonly batches = new Map<string, InstancedBatch>();
  private readonly materials = new Map<string, THREE.Material>();
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

    // Sair do teste devolve a fase ao que ela era: anel pego volta, inimigo
    // derrotado levanta, mola disparada descarrega. Sem isto, testar a fase a
    // consumiria — a segunda vez que a mae apertasse Jogar, metade dos aneis
    // teria sumido do projeto dela.
    resetTrackToys();
    resetPatrollers();
    for (const node of this.document.nodes) this.place(node);
  }

  get playing(): boolean {
    return this.hero >= 0;
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
    const built: Built = {
      node: node.id,
      entity,
      piece,
      object: null,
      batch: null,
      collider: null,
    };

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

    // Os componentes que a peca declara viram componentes de verdade na
    // entidade. E isto que transforma "um anel desenhado" em "um anel que se
    // pega": o comportamento mora no kit, e a peca so diz qual deles ela tem.
    //
    // O ponto de partida e a excecao: os componentes dele descrevem o
    // personagem e a camera do teste, que sao outras entidades.
    if (node.piece !== 'inicio') {
      for (const nome of Object.keys(piece.components)) {
        const componente = componentRegistry.find((candidato) => candidato.name === nome);
        componente?.add(entity);
      }
    }

    this.built.set(node.id, built);
    this.byEntity.set(entity, node.id);
    this.place(node);
    // Primeiro os valores de fabrica da peca, depois o que foi editado no no.
    if (node.piece !== 'inicio') {
      for (const [nome, valores] of Object.entries(piece.components)) {
        applyFieldsTo(entity, valores, nome);
      }
    }
    this.applyFields(node.id, null);
  }

  private destroy(nodeId: string): void {
    const built = this.built.get(nodeId);
    if (!built) return;
    if (built.collider) {
      this.host.physics?.removeCollider(built.collider);
      built.collider = null;
    }
    built.batch?.release(built.entity);
    if (built.object) this.host.detach(built.entity);
    this.host.world.destroy(built.entity);
    this.byEntity.delete(built.entity);
    this.built.delete(nodeId);
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

    this.rebuildCollider(node, built);
  }

  /**
   * Refaz o colisor da peca no lugar onde ela esta agora.
   *
   * Colisor de malha nao tem escala propria no Rapier — a escala vive nos
   * vertices. Entao mover, girar ou redimensionar uma peca no editor refaz o
   * colisor inteiro, e nao remenda o antigo. Custa uma malha por mexida, e
   * paga com a garantia de que o que se ve e o que se colide: uma pista que
   * parece uma coisa e colide como outra e o pior bug possivel numa engine de
   * plataforma.
   */
  private rebuildCollider(node: SceneNode, built: Built): void {
    const physics = this.host.physics;
    if (built.collider) {
      physics?.removeCollider(built.collider);
      built.collider = null;
    }
    if (!physics || !node.visible) return;

    const place = worldPlacement(this.document, node);
    const malha = scaledTrimesh(built.piece, place.sx, place.sy, place.sz);
    if (!malha) return;

    built.collider = physics.addTrimesh(malha.vertices, malha.indices, {
      position: { x: place.x, y: place.y, z: place.z },
      rotation: yawQuaternion(place.yaw),
    });
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
