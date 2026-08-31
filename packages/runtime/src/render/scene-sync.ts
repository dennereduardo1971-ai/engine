import * as THREE from 'three';
import { defineSystem, type System } from '../ecs/system.ts';
import { type Entity } from '../ecs/entity.ts';
import { view } from '../ecs/view.ts';
import { Transform, Visual } from '../scene/components.ts';

/**
 * Guarda os objetos do Three.js e liga cada um a uma entidade pelo componente
 * Visual. O ECS nunca guarda o objeto em si: guarda um numero.
 */
export class ObjectRegistry {
  private readonly objects: (THREE.Object3D | null)[] = [];
  private readonly free: number[] = [];

  constructor(readonly root: THREE.Object3D) {}

  /** Coloca o objeto na cena e amarra a entidade nele. */
  attach(entity: Entity, object: THREE.Object3D): number {
    const handle = this.free.pop() ?? this.objects.length;
    this.objects[handle] = object;
    object.matrixAutoUpdate = false;
    this.root.add(object);
    Visual.fields.handle[Visual.add(entity)] = handle;
    return handle;
  }

  get(handle: number): THREE.Object3D | null {
    return this.objects[handle] ?? null;
  }

  detach(entity: Entity): void {
    const slot = Visual.slotOf(entity);
    if (slot < 0) return;
    const handle = Visual.fields.handle[slot];
    const object = this.objects[handle];
    if (object) {
      this.root.remove(object);
      this.objects[handle] = null;
      this.free.push(handle);
    }
    Visual.remove(entity);
  }
}

/**
 * Leva o estado do ECS para os objetos do Three.js, interpolando entre o passo
 * anterior e o atual. Roda na fase de render, uma vez por quadro desenhado.
 */
export function visualSyncSystem(registry: ObjectRegistry): System {
  const previous = new THREE.Quaternion();
  const current = new THREE.Quaternion();
  const visiveis = view(Transform, Visual);
  return defineSystem({
    name: 'VisualSync',
    phase: 'render',
    order: -100,
    update({ alpha }) {
      const t = Transform.fields;
      const v = Visual.fields;
      visiveis.each((_entity, ts, vs) => {
        const object = registry.get(v.handle[vs]);
        if (!object) return;
        object.position.set(
          t.px[ts] + (t.x[ts] - t.px[ts]) * alpha,
          t.py[ts] + (t.y[ts] - t.py[ts]) * alpha,
          t.pz[ts] + (t.z[ts] - t.pz[ts]) * alpha,
        );
        previous.set(t.pqx[ts], t.pqy[ts], t.pqz[ts], t.pqw[ts]);
        current.set(t.qx[ts], t.qy[ts], t.qz[ts], t.qw[ts]);
        object.quaternion.copy(previous).slerp(current, alpha);
        object.scale.set(t.sx[ts], t.sy[ts], t.sz[ts]);
        object.updateMatrix();
      });
    },
  });
}
