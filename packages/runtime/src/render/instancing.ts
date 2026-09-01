import * as THREE from 'three';
import { defineSystem, type System } from '../ecs/system.ts';
import { type Entity } from '../ecs/entity.ts';
import { view } from '../ecs/view.ts';
import { Instanced, Transform } from '../scene/components.ts';

/**
 * Um lote instanciado: muitos objetos iguais desenhados numa chamada so.
 *
 * E assim que 50 aneis (ou 20 mil) custam uma chamada de desenho em vez de 50.
 * O orcamento do plano da 300 chamadas por quadro; sem instancing, uma fase de
 * Sonic gasta isso so com anel.
 */
export class InstancedBatch {
  readonly mesh: THREE.InstancedMesh;
  private readonly entities: Entity[] = [];
  private used = 0;

  constructor(
    readonly id: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly capacity: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  get count(): number {
    return this.used;
  }

  /**
   * Entidade que ocupa uma vaga do lote. E o caminho de volta do clique: o
   * raycaster do Three devolve o `instanceId` da instancia acertada, e quem
   * clicou precisa saber qual anel e aquele.
   */
  entityAt(index: number): Entity | undefined {
    return index >= 0 && index < this.used ? this.entities[index] : undefined;
  }

  /** Reserva uma vaga no lote para a entidade. -1 se o lote encheu. */
  claim(entity: Entity): number {
    if (this.used >= this.capacity) return -1;
    const index = this.used++;
    this.entities[index] = entity;
    this.mesh.count = this.used;
    const slot = Instanced.add(entity);
    Instanced.fields.batch[slot] = this.id;
    Instanced.fields.index[slot] = index;
    return index;
  }

  /** Devolve a vaga; a ultima entidade do lote toma o lugar dela. */
  release(entity: Entity): void {
    const slot = Instanced.slotOf(entity);
    if (slot < 0) return;
    const index = Instanced.fields.index[slot];
    const last = --this.used;
    if (index !== last) {
      const moved = this.entities[last];
      this.entities[index] = moved;
      const movedSlot = Instanced.slotOf(moved);
      if (movedSlot >= 0) Instanced.fields.index[movedSlot] = index;
    }
    this.entities.length = this.used;
    this.mesh.count = this.used;
    Instanced.remove(entity);
  }

  clear(): void {
    this.used = 0;
    this.entities.length = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/**
 * Escreve a matriz de cada instancia a partir do Transform, com a mesma
 * interpolacao do resto da cena.
 */
export function instancedSyncSystem(batches: readonly InstancedBatch[]): System {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const previous = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const instancias = view(Transform, Instanced);

  return defineSystem({
    name: 'InstancedSync',
    phase: 'render',
    order: -90,
    update({ alpha }) {
      if (batches.length === 0) return;
      const t = Transform.fields;
      const i = Instanced.fields;

      instancias.each((_entity, ts, is) => {
        const batch = batches[i.batch[is]];
        if (!batch) return;
        position.set(
          t.px[ts] + (t.x[ts] - t.px[ts]) * alpha,
          t.py[ts] + (t.y[ts] - t.py[ts]) * alpha,
          t.pz[ts] + (t.z[ts] - t.pz[ts]) * alpha,
        );
        previous.set(t.pqx[ts], t.pqy[ts], t.pqz[ts], t.pqw[ts]);
        rotation.set(t.qx[ts], t.qy[ts], t.qz[ts], t.qw[ts]);
        previous.slerp(rotation, alpha);
        scale.set(t.sx[ts], t.sy[ts], t.sz[ts]);
        matrix.compose(position, previous, scale);
        batch.mesh.setMatrixAt(i.index[is], matrix);
      });

      for (const batch of batches) {
        if (batch.count > 0) batch.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  });
}
