import type * as RAPIER from '@dimforge/rapier3d-compat';
import { rapier } from './rapier.ts';

/**
 * O mundo de fisica.
 *
 * Ele e uma casca fina em volta do Rapier, com tres responsabilidades: montar
 * a geometria de colisao da fase, andar um passo fixo, e responder consulta —
 * "o que tem nesta direcao?" e "qual a inclinacao do chao aqui?".
 *
 * Consulta so enxerga um colisor depois que a arvore espacial dele foi
 * montada. Quem chama nao deveria precisar saber disso, entao toda mudanca de
 * geometria marca o mundo como sujo e a proxima consulta refaz a arvore antes
 * de responder. E de graca quando nada mudou.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Onde uma peca de colisao fica no mundo. */
export interface Placement {
  position?: Vec3;
  rotation?: Quat;
}

/** O que uma consulta encontrou. */
export interface Hit {
  /** Distancia da origem ate o encontro, em unidades do mundo. */
  distance: number;
  point: Vec3;
  /**
   * Normal da superficie, apontando para fora dela — para cima, num chao.
   * E ela que vira o "para cima" proprio do personagem, e e por isso que loop
   * e parede funcionam.
   */
  normal: Vec3;
  collider: RAPIER.Collider;
}

/**
 * Gravidade padrao. Nao e a da Terra: e a do Kit Velocidade, escolhida junto
 * com a forca do pulo para dar o arco de um jogo de plataforma rapido.
 */
export const DEFAULT_GRAVITY: Vec3 = { x: 0, y: -46, z: 0 };

export interface PhysicsOptions {
  gravity?: Vec3;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;

  /** Alguma geometria mudou desde a ultima vez que a arvore foi montada. */
  private suja = true;

  private readonly ray: RAPIER.Ray;
  private readonly semGiro: Quat = { x: 0, y: 0, z: 0, w: 1 };

  /**
   * Exige que `loadRapier()` ja tenha terminado. O construtor e sincrono de
   * proposito: uma engine cujo construtor e `async` contamina de `await` todo
   * codigo de fase, de peca e de teste.
   */
  constructor(options: PhysicsOptions = {}) {
    const R = rapier();
    this.world = new R.World(options.gravity ?? DEFAULT_GRAVITY);
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  get gravity(): Vec3 {
    return this.world.gravity;
  }

  /** Um passo fixo. A arvore de consulta sai atualizada dele. */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
    this.suja = false;
  }

  /** Caixa parada: chao, parede, plataforma. `halfExtents` sao meias medidas. */
  addBox(halfExtents: Vec3, placement: Placement = {}): RAPIER.Collider {
    const R = rapier();
    return this.addCollider(
      R.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
      placement,
    );
  }

  /**
   * Malha de triangulos parada — a forma de colisao de uma pista de verdade.
   *
   * `vertices` sao trincas x,y,z e `indices` sao trincas de posicoes nessa
   * lista. E o mesmo formato que a geometria do Three.js usa, entao a peca
   * desenhada e a peca colidida saem da mesma fonte.
   */
  addTrimesh(
    vertices: Float32Array,
    indices: Uint32Array,
    placement: Placement = {},
  ): RAPIER.Collider {
    const R = rapier();
    return this.addCollider(R.ColliderDesc.trimesh(vertices, indices), placement);
  }

  /**
   * Lanca um raio fino e devolve o primeiro encontro.
   *
   * `direction` precisa ser unitario: a distancia devolvida e medida na
   * unidade dele.
   */
  castRay(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    exclude?: RAPIER.Collider,
  ): Hit | null {
    this.prepararConsulta();
    this.ray.origin.x = origin.x;
    this.ray.origin.y = origin.y;
    this.ray.origin.z = origin.z;
    this.ray.dir.x = direction.x;
    this.ray.dir.y = direction.y;
    this.ray.dir.z = direction.z;

    const hit = this.world.castRayAndGetNormal(
      this.ray,
      maxDistance,
      true,
      undefined,
      undefined,
      exclude,
    );
    if (!hit) return null;

    return {
      distance: hit.timeOfImpact,
      point: {
        x: origin.x + direction.x * hit.timeOfImpact,
        y: origin.y + direction.y * hit.timeOfImpact,
        z: origin.z + direction.z * hit.timeOfImpact,
      },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      collider: hit.collider,
    };
  }

  /**
   * Empurra uma bola de raio `radius` na direcao dada e diz onde ela encosta.
   *
   * O personagem anda assim, e nao com um raio fino: uma bola tem largura, e e
   * a largura dela que impede o personagem de atravessar o canto de uma
   * parede que um raio no centro do corpo passaria raspando.
   */
  castBall(
    radius: number,
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    exclude?: RAPIER.Collider,
  ): Hit | null {
    this.prepararConsulta();
    const R = rapier();
    const hit = this.world.castShape(
      origin,
      this.semGiro,
      direction,
      new R.Ball(radius),
      0,
      maxDistance,
      true,
      undefined,
      undefined,
      exclude,
    );
    if (!hit) return null;

    const distancia = hit.time_of_impact;

    // `normal1` e a normal do lado de fora da superficie encontrada — a que
    // aponta de volta para quem lancou. E dela que sai o "para cima".
    return {
      distance: distancia,
      point: {
        x: origin.x + direction.x * distancia,
        y: origin.y + direction.y * distancia,
        z: origin.z + direction.z * distancia,
      },
      normal: { x: hit.normal1.x, y: hit.normal1.y, z: hit.normal1.z },
      collider: hit.collider,
    };
  }

  removeCollider(collider: RAPIER.Collider): void {
    this.world.removeCollider(collider, false);
    this.suja = true;
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
    this.suja = true;
  }

  /** Esvazia o mundo: trocar de fase, recarregar a cena no editor. */
  clear(): void {
    const colisores: RAPIER.Collider[] = [];
    this.world.forEachCollider((collider) => colisores.push(collider));
    for (const collider of colisores) this.world.removeCollider(collider, false);

    const corpos: RAPIER.RigidBody[] = [];
    this.world.forEachRigidBody((body) => corpos.push(body));
    for (const body of corpos) this.world.removeRigidBody(body);

    this.suja = true;
  }

  dispose(): void {
    this.world.free();
  }

  private addCollider(desc: RAPIER.ColliderDesc, placement: Placement): RAPIER.Collider {
    if (placement.position) {
      desc.setTranslation(placement.position.x, placement.position.y, placement.position.z);
    }
    if (placement.rotation) desc.setRotation(placement.rotation);
    this.suja = true;
    return this.world.createCollider(desc);
  }

  /**
   * Monta a arvore espacial se alguma geometria mudou.
   *
   * Sem isto, um colisor recem-criado e invisivel para consulta ate o proximo
   * passo — e "o chao que acabou de ser posto nao existe" e um bug que se
   * manifesta longe daqui, como um personagem caindo pelo mundo.
   *
   * Um passo de duracao zero monta a arvore sem mover nada: nesta versao do
   * Rapier nao ha como pedir so a arvore.
   */
  private prepararConsulta(): void {
    if (!this.suja) return;
    this.world.timestep = 0;
    this.world.step();
    this.suja = false;
  }
}
