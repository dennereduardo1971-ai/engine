import { defineComponent } from '../ecs/component.ts';
import { defineSystem, type System } from '../ecs/system.ts';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import { type Entity } from '../ecs/entity.ts';
import { view } from '../ecs/view.ts';
import { Transform } from '../scene/components.ts';
import { type PhysicsWorld } from './world.ts';

/**
 * Liga a entidade a um corpo rigido do Rapier.
 *
 * O ECS guarda um numero, como faz com os objetos do Three.js: o `handle` do
 * corpo. O objeto em si mora num registro a parte, porque array tipado guarda
 * numero, e nao ponteiro — e e isso que deixa percorrer mil corpos rapido.
 */
export const Body = defineComponent('Body', 'Corpo', {
  handle: 'u32',
  /** 0 parado, 1 movido pela fisica, 2 movido por voce. */
  kind: 'u8',
});

export const BODY_FIXED = 0;
export const BODY_DYNAMIC = 1;
export const BODY_KINEMATIC = 2;

/** Guarda os corpos do Rapier ligados a entidades. */
export class BodyRegistry {
  private readonly bodies = new Map<number, RAPIER.RigidBody>();

  constructor(private readonly physics: PhysicsWorld) {}

  attach(entity: Entity, body: RAPIER.RigidBody, kind: number): void {
    const slot = Body.add(entity);
    Body.fields.handle[slot] = body.handle;
    Body.fields.kind[slot] = kind;
    this.bodies.set(body.handle, body);
  }

  get(handle: number): RAPIER.RigidBody | undefined {
    return this.bodies.get(handle);
  }

  detach(entity: Entity): void {
    const slot = Body.slotOf(entity);
    if (slot < 0) return;
    const handle = Body.fields.handle[slot];
    const body = this.bodies.get(handle);
    if (body) {
      this.physics.removeBody(body);
      this.bodies.delete(handle);
    }
    Body.remove(entity);
  }

  clear(): void {
    for (const body of this.bodies.values()) this.physics.removeBody(body);
    this.bodies.clear();
  }
}

/** Roda um passo fixo da fisica. Primeiro sistema da fase de fisica. */
export function physicsStepSystem(physics: PhysicsWorld): System {
  return defineSystem({
    name: 'PhysicsStep',
    phase: 'physics',
    order: -1000,
    update({ dt }) {
      physics.step(dt);
    },
  });
}

/**
 * Leva o resultado da fisica para o Transform, e a vontade de quem dirige um
 * corpo cinematico para a fisica. Roda depois do passo.
 */
export function physicsSyncSystem(registry: BodyRegistry): System {
  const corpos = view(Transform, Body);
  return defineSystem({
    name: 'PhysicsSync',
    phase: 'physics',
    order: 1000,
    update() {
      const t = Transform.fields;
      const b = Body.fields;
      corpos.each((_entity, ts, bs) => {
        const body = registry.get(b.handle[bs]);
        if (!body) return;

        if (b.kind[bs] === BODY_KINEMATIC) {
          // Quem manda e o ECS: a fisica so leva o corpo ate la.
          body.setNextKinematicTranslation({ x: t.x[ts], y: t.y[ts], z: t.z[ts] });
          body.setNextKinematicRotation({
            x: t.qx[ts],
            y: t.qy[ts],
            z: t.qz[ts],
            w: t.qw[ts],
          });
          return;
        }
        if (b.kind[bs] !== BODY_DYNAMIC) return;

        const p = body.translation();
        const r = body.rotation();
        t.x[ts] = p.x;
        t.y[ts] = p.y;
        t.z[ts] = p.z;
        t.qx[ts] = r.x;
        t.qy[ts] = r.y;
        t.qz[ts] = r.z;
        t.qw[ts] = r.w;
      });
    },
  });
}
