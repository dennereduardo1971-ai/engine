import { type Phase } from '../ecs/system.ts';

/**
 * Orcamento de performance da secao 3 do plano, em milissegundos e contagens.
 * Maquina de referencia: Intel Core i5, grafico Intel integrado, 8 GB de RAM.
 */
export const BUDGET = {
  /** 60 fps. */
  frame: 16.6,
  /** Teto duro: acima disso o jogo trava visivelmente. */
  frameHard: 20,
  logic: 4,
  physics: 3,
  render: 8,
  drawCalls: 300,
  drawCallsHard: 600,
  triangles: 250_000,
  trianglesHard: 500_000,
} as const;

const HISTORY = 120; // dois segundos a 60 fps

/** Uma serie de tempos recente, com media, pior caso e percentil 95. */
class Series {
  private readonly samples = new Float32Array(HISTORY);
  private cursor = 0;
  private filled = 0;
  private sum = 0;
  last = 0;

  push(value: number): void {
    this.sum += value - this.samples[this.cursor];
    this.samples[this.cursor] = value;
    this.cursor = (this.cursor + 1) % HISTORY;
    if (this.filled < HISTORY) this.filled++;
    this.last = value;
  }

  get average(): number {
    return this.filled === 0 ? 0 : this.sum / this.filled;
  }

  get max(): number {
    let max = 0;
    for (let i = 0; i < this.filled; i++) if (this.samples[i] > max) max = this.samples[i];
    return max;
  }

  /** Percentil 95: o quadro ruim que o jogador realmente sente. */
  get p95(): number {
    if (this.filled === 0) return 0;
    const sorted = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  }

  reset(): void {
    this.samples.fill(0);
    this.cursor = 0;
    this.filled = 0;
    this.sum = 0;
    this.last = 0;
  }
}

export interface FrameStats {
  frame: number;
  fps: number;
  total: number;
  logic: number;
  physics: number;
  render: number;
  steps: number;
  drawCalls: number;
  triangles: number;
  entities: number;
}

/**
 * Mede quanto cada fase custou e compara com o orcamento. E daqui que sai o
 * contador de fps do M0 e o veredito "esta maquina aguenta".
 */
export class Profiler {
  /** Tempo de trabalho da engine por quadro (logica + fisica + render). */
  readonly total = new Series();
  /**
   * Tempo de relogio entre quadros. E daqui que sai o fps mostrado: inclui a
   * espera pelo vsync e o que o navegador fez por conta propria, que e o que o
   * jogador realmente sente.
   */
  readonly wall = new Series();
  readonly phases: Record<Phase, Series> = {
    logic: new Series(),
    physics: new Series(),
    render: new Series(),
  };

  frame = 0;
  steps = 0;
  drawCalls = 0;
  triangles = 0;
  entities = 0;

  private marks: Partial<Record<Phase | 'frame', number>> = {};

  now(): number {
    return performance.now();
  }

  begin(key: Phase | 'frame'): void {
    this.marks[key] = this.now();
  }

  end(key: Phase | 'frame'): number {
    const started = this.marks[key];
    if (started === undefined) return 0;
    const elapsed = this.now() - started;
    if (key === 'frame') {
      this.total.push(elapsed);
      this.frame++;
    } else {
      this.phases[key].push(elapsed);
    }
    return elapsed;
  }

  /** Soma o tempo de uma fase que rodou varias vezes no mesmo quadro. */
  addPhase(phase: Phase, milliseconds: number): void {
    this.phases[phase].push(milliseconds);
  }

  /** Registra o intervalo real entre dois quadros, em milissegundos. */
  pushWall(milliseconds: number): void {
    this.wall.push(milliseconds);
  }

  get fps(): number {
    const average = this.wall.average;
    return average > 0 ? 1000 / average : 0;
  }

  snapshot(): FrameStats {
    return {
      frame: this.frame,
      fps: this.fps,
      total: this.total.average,
      logic: this.phases.logic.average,
      physics: this.phases.physics.average,
      render: this.phases.render.average,
      steps: this.steps,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      entities: this.entities,
    };
  }

  /** Lista o que estourou o orcamento agora. Vazio = tudo dentro. */
  overBudget(): string[] {
    const over: string[] = [];
    if (this.total.p95 > BUDGET.frame) over.push('quadro');
    if (this.phases.logic.average > BUDGET.logic) over.push('logica');
    if (this.phases.physics.average > BUDGET.physics) over.push('fisica');
    if (this.phases.render.average > BUDGET.render) over.push('render');
    if (this.drawCalls > BUDGET.drawCalls) over.push('chamadas de desenho');
    if (this.triangles > BUDGET.triangles) over.push('triangulos');
    return over;
  }

  reset(): void {
    this.total.reset();
    this.wall.reset();
    for (const series of Object.values(this.phases)) series.reset();
    this.frame = 0;
    this.steps = 0;
  }
}
