import * as THREE from 'three';
import { World } from './ecs/world.ts';
import { Input, type InputOptions } from './input/input.ts';
import { type Entity } from './ecs/entity.ts';
import { Scheduler, type System, type UpdateContext } from './ecs/system.ts';
import { Loop } from './loop/loop.ts';
import { Profiler } from './loop/profiler.ts';
import { Renderer } from './render/renderer.ts';
import { QualitySupervisor } from './render/quality.ts';
import { InstancedBatch, instancedSyncSystem } from './render/instancing.ts';
import { ObjectRegistry, visualSyncSystem } from './render/scene-sync.ts';
import { transformHistorySystem, velocitySystem } from './scene/systems.ts';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** Passo fixo da simulacao, em segundos. Padrao 1/60. */
  step?: number;
  maxPixelRatio?: number;
  clearColor?: number;
  /** Liga a qualidade adaptativa. Padrao: ligada. */
  adaptiveQuality?: boolean;
  /** Opcoes da entrada (mapeamento de controles, alvo dos eventos). */
  input?: InputOptions;
}

/**
 * A engine amarra as pecas do runtime: mundo, agendador de sistemas, laco de
 * passo fixo, renderizador, medidor de orcamento e qualidade adaptativa.
 *
 * Ela nao sabe que o editor existe — e ela que vai dentro do jogo publicado
 * (secao 4 do plano, regra de ouro das camadas).
 */
export class Engine {
  readonly world = new World();
  readonly scheduler = new Scheduler();
  readonly profiler = new Profiler();
  readonly renderer: Renderer;
  readonly quality: QualitySupervisor;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly objects: ObjectRegistry;
  readonly loop: Loop;
  readonly input: Input;

  private readonly batches: InstancedBatch[] = [];
  private logicMs = 0;
  private physicsMs = 0;

  constructor(options: EngineOptions) {
    this.renderer = new Renderer({
      canvas: options.canvas,
      maxPixelRatio: options.maxPixelRatio,
      clearColor: options.clearColor,
    });
    this.camera = new THREE.PerspectiveCamera(60, this.renderer.aspect, 0.1, 500);
    this.objects = new ObjectRegistry(this.scene);
    this.input = new Input(options.input);
    this.quality = new QualitySupervisor(this.profiler);
    this.quality.enabled = options.adaptiveQuality ?? true;

    this.loop = new Loop({
      step: options.step,
      onFixed: (step, elapsed, dt) => this.fixedStep(step, elapsed, dt),
      onRender: (alpha, frameTime) => this.renderFrame(alpha, frameTime),
    });

    // Sistemas de fundacao, sempre presentes.
    this.add(transformHistorySystem());
    this.add(velocitySystem());
    this.add(visualSyncSystem(this.objects));
    this.add(instancedSyncSystem(this.batches));

    // Degrau de qualidade que ja existe no M0: escala de renderizacao.
    // Sombras, particulas e pos-processamento entram nos degraus certos
    // quando esses sistemas existirem.
    this.quality.addRung({
      name: 'resolucao de renderizacao',
      down: () => {
        this.renderer.renderScale = this.renderer.renderScale - 0.25;
      },
      up: () => {
        this.renderer.renderScale = this.renderer.renderScale + 0.25;
      },
    });
  }

  add(system: System): System {
    return this.scheduler.add(system, this.world);
  }

  remove(name: string): boolean {
    return this.scheduler.remove(name, this.world);
  }

  /** Coloca um objeto do Three.js na cena, amarrado a uma entidade. */
  attach(entity: Entity, object: THREE.Object3D): number {
    return this.objects.attach(entity, object);
  }

  /**
   * Tira o objeto da cena e solta a amarra com a entidade.
   *
   * Destruir a entidade sozinha nao basta: o mundo tira os componentes dela,
   * mas quem guarda o objeto do Three.js e o registro da cena, e ninguem
   * avisa ele. Sem esta chamada, apagar uma peca no editor a apagaria do ECS
   * e a deixaria desenhada na tela.
   */
  detach(entity: Entity): void {
    this.objects.detach(entity);
  }

  /** Cria um lote instanciado (muitos objetos iguais, uma chamada de desenho). */
  createBatch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ): InstancedBatch {
    const batch = new InstancedBatch(this.batches.length, geometry, material, capacity);
    this.batches.push(batch);
    this.scene.add(batch.mesh);
    return batch;
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  dispose(): void {
    this.stop();
    this.input.dispose();
    this.scheduler.stopAll(this.world);
    for (const batch of this.batches) batch.dispose();
    this.renderer.dispose();
  }

  private fixedStep(step: number, elapsed: number, dt: number): void {
    const context: UpdateContext = {
      world: this.world,
      dt,
      elapsed,
      step,
      frame: this.profiler.frame,
      frameTime: dt,
      alpha: 1,
    };

    // A entrada e lida antes de qualquer sistema: as bordas de botao ficam
    // alinhadas com o passo da simulacao.
    let mark = performance.now();
    this.input.update();
    this.scheduler.run('logic', context);
    const afterLogic = performance.now();
    this.logicMs += afterLogic - mark;

    mark = afterLogic;
    this.scheduler.run('physics', context);
    this.physicsMs += performance.now() - mark;
    this.profiler.steps++;
  }

  private renderFrame(alpha: number, frameTime: number): void {
    if (this.renderer.resize()) {
      this.camera.aspect = this.renderer.aspect;
      this.camera.updateProjectionMatrix();
    }

    const context: UpdateContext = {
      world: this.world,
      dt: 0,
      elapsed: this.loop.elapsed,
      step: this.loop.stepCount,
      frame: this.profiler.frame,
      frameTime,
      alpha,
    };

    const start = performance.now();
    this.scheduler.run('render', context);
    this.renderer.render(this.scene, this.camera);
    const renderMs = performance.now() - start;

    // Fecha a conta do quadro: as fases medidas viram o tempo de trabalho, e o
    // intervalo real entre quadros vira o fps.
    this.profiler.addPhase('logic', this.logicMs);
    this.profiler.addPhase('physics', this.physicsMs);
    this.profiler.addPhase('render', renderMs);
    this.profiler.total.push(this.logicMs + this.physicsMs + renderMs);
    this.profiler.pushWall(frameTime * 1000);
    this.profiler.frame++;
    this.logicMs = 0;
    this.physicsMs = 0;

    const stats = this.renderer.stats();
    this.profiler.drawCalls = stats.drawCalls;
    this.profiler.triangles = stats.triangles;
    this.profiler.entities = this.world.count;

    this.quality.update();
  }
}
