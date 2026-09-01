/**
 * Faisca — runtime.
 *
 * Este pacote e a engine propriamente dita: e ele que vai dentro do jogo
 * publicado, e ele roda sem o editor. Nada aqui pode depender da interface de
 * autoria (secao 4 do plano).
 */
export { type Entity, NO_ENTITY, MAX_ENTITIES, entityIndex, entityGeneration, makeEntity } from './ecs/entity.ts';
export {
  Component,
  componentRegistry,
  defineComponent,
  defineTag,
  NO_SLOT,
  type Defaults,
  type FieldType,
  type Fields,
  type Schema,
} from './ecs/component.ts';
export { World } from './ecs/world.ts';
export { view, type View1, type View2, type View3 } from './ecs/view.ts';
export {
  defineSystem,
  Scheduler,
  PHASES,
  type Phase,
  type System,
  type UpdateContext,
} from './ecs/system.ts';

export {
  Input,
  applyDeadzone,
  type GamepadLike,
  type InputOptions,
  type Vec2,
} from './input/input.ts';
export {
  defaultBindings,
  XBOX,
  type AxisBinding,
  type Bindings,
  type ButtonBinding,
} from './input/bindings.ts';

export { Loop, DEFAULT_STEP, type LoopOptions } from './loop/loop.ts';
export { Profiler, BUDGET, type FrameStats } from './loop/profiler.ts';

export { Renderer, type GraphicsReport, type RendererOptions } from './render/renderer.ts';
export { QualitySupervisor, type QualityRung, type QualityOptions } from './render/quality.ts';
export { ObjectRegistry, visualSyncSystem } from './render/scene-sync.ts';
export { InstancedBatch, instancedSyncSystem } from './render/instancing.ts';

export { Transform, Velocity, Visual, Instanced, placeAt } from './scene/components.ts';
export { transformHistorySystem, velocitySystem } from './scene/systems.ts';

export {
  loadRapier,
  rapier,
  rapierReady,
  type Collider,
  type Rapier,
  type RigidBody,
  type Shape,
} from './physics/rapier.ts';
export {
  DEFAULT_GRAVITY,
  PhysicsWorld,
  type Hit,
  type PhysicsOptions,
  type Placement,
  type Quat,
  type Vec3,
} from './physics/world.ts';
export {
  Body,
  BodyRegistry,
  BODY_DYNAMIC,
  BODY_FIXED,
  BODY_KINEMATIC,
  physicsStepSystem,
  physicsSyncSystem,
} from './physics/components.ts';

export { MemoryStorage, SaveSlot, type SaveOptions } from './save/save.ts';

export { Engine, type EngineOptions } from './engine.ts';
export { PerfHud } from './debug/perf-hud.ts';
