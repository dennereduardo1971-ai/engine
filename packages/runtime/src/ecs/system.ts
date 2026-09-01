import { type World } from './world.ts';

/**
 * Fases de um quadro, na ordem em que rodam. Elas existem separadas porque o
 * orcamento de performance do plano e cobrado por fase: 4 ms de logica,
 * 3 ms de fisica, 8 ms de render.
 */
export type Phase = 'logic' | 'physics' | 'render';

export const PHASES: readonly Phase[] = ['logic', 'physics', 'render'];

export interface UpdateContext {
  readonly world: World;
  /** Passo fixo em segundos (logica e fisica). */
  readonly dt: number;
  /** Tempo simulado desde o inicio, em segundos. */
  readonly elapsed: number;
  /** Numero do passo fixo desde o inicio. */
  readonly step: number;
  /** Numero do quadro desenhado desde o inicio. */
  readonly frame: number;
  /**
   * Tempo real do ultimo quadro, em segundos. A fase de logica recebe o passo
   * fixo; a de render recebe o intervalo de verdade, que e o que uma camera
   * suavizada precisa para se comportar igual a 30 e a 144 fps.
   */
  readonly frameTime: number;
  /**
   * Quanto do proximo passo ja passou, de 0 a 1. So a fase de render usa:
   * e o que deixa o desenho suave mesmo com a simulacao em passo fixo.
   */
  readonly alpha: number;
}

export interface System {
  /** Nome unico, usado no inspetor de performance. */
  readonly name: string;
  readonly phase: Phase;
  /** Menor roda antes. Padrao 0. */
  readonly order?: number;
  enabled?: boolean;
  update(context: UpdateContext): void;
  /** Chamado uma vez quando o sistema entra no agendador. */
  start?(world: World): void;
  /** Chamado quando o sistema sai, ou quando a engine para. */
  stop?(world: World): void;
}

export function defineSystem(system: System): System {
  return system;
}

/** Guarda os sistemas por fase e os roda na ordem pedida. */
export class Scheduler {
  private readonly systems = new Map<Phase, System[]>([
    ['logic', []],
    ['physics', []],
    ['render', []],
  ]);
  private readonly started = new Set<System>();

  add(system: System, world?: World): System {
    const list = this.systems.get(system.phase);
    if (!list) throw new Error(`Faisca: fase desconhecida "${system.phase}".`);
    if (list.some((existing) => existing.name === system.name)) {
      throw new Error(`Faisca: ja existe um sistema chamado "${system.name}" na fase ${system.phase}.`);
    }
    list.push(system);
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (world && system.start && !this.started.has(system)) {
      system.start(world);
      this.started.add(system);
    }
    return system;
  }

  remove(name: string, world?: World): boolean {
    for (const list of this.systems.values()) {
      const index = list.findIndex((system) => system.name === name);
      if (index === -1) continue;
      const [system] = list.splice(index, 1);
      if (world && system.stop && this.started.has(system)) system.stop(world);
      this.started.delete(system);
      return true;
    }
    return false;
  }

  get(phase: Phase): readonly System[] {
    return this.systems.get(phase) ?? [];
  }

  /** Roda uma fase inteira. O tempo gasto e medido por quem chama. */
  run(phase: Phase, context: UpdateContext): void {
    const list = this.systems.get(phase);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const system = list[i];
      if (system.enabled === false) continue;
      system.update(context);
    }
  }

  stopAll(world: World): void {
    for (const system of this.started) system.stop?.(world);
    this.started.clear();
  }
}
