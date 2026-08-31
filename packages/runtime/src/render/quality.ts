import { BUDGET, type Profiler } from '../loop/profiler.ts';

export interface QualityRung {
  /** Nome exibido no inspetor de performance. */
  readonly name: string;
  /** Piora este degrau (economiza tempo de quadro). */
  down(): void;
  /** Melhora este degrau de volta. */
  up(): void;
}

export interface QualityOptions {
  /** De quantos em quantos quadros o supervisor decide. */
  interval?: number;
  /** Quadros ruins seguidos antes de descer um degrau. */
  patienceDown?: number;
  /** Janelas boas seguidas antes de subir um degrau. */
  patienceUp?: number;
}

/**
 * Qualidade adaptativa automatica (secao 3 do plano).
 *
 * Os degraus sao registrados na ordem em que devem cair: sombras distantes,
 * densidade de particulas, resolucao de renderizacao, qualidade de sombra,
 * pos-processamento. Quando sobra folga, sobem de volta na ordem inversa, e
 * mais devagar do que desceram — subir cedo demais faz a imagem ficar
 * piscando entre dois niveis, que incomoda mais que a perda de qualidade.
 */
export class QualitySupervisor {
  private readonly rungs: QualityRung[] = [];
  private readonly interval: number;
  private readonly patienceDown: number;
  private readonly patienceUp: number;

  private badWindows = 0;
  private goodWindows = 0;
  private framesInWindow = 0;

  /** Quantos degraus ja desceram. 0 = qualidade cheia. */
  level = 0;
  enabled = true;

  constructor(
    private readonly profiler: Profiler,
    options: QualityOptions = {},
  ) {
    this.interval = options.interval ?? 30;
    this.patienceDown = options.patienceDown ?? 2;
    this.patienceUp = options.patienceUp ?? 6;
  }

  addRung(rung: QualityRung): void {
    this.rungs.push(rung);
  }

  get currentRung(): string {
    return this.level === 0 ? 'cheia' : (this.rungs[this.level - 1]?.name ?? 'minima');
  }

  /** Chamado uma vez por quadro desenhado. */
  update(): void {
    if (!this.enabled || this.rungs.length === 0) return;
    if (++this.framesInWindow < this.interval) return;
    this.framesInWindow = 0;

    const worst = this.profiler.total.p95;
    if (worst > BUDGET.frame) {
      this.goodWindows = 0;
      if (++this.badWindows >= this.patienceDown) {
        this.badWindows = 0;
        this.stepDown();
      }
      return;
    }

    // So considera subir com folga real (80% do orcamento), nao no limite.
    if (worst < BUDGET.frame * 0.8) {
      this.badWindows = 0;
      if (++this.goodWindows >= this.patienceUp) {
        this.goodWindows = 0;
        this.stepUp();
      }
    }
  }

  stepDown(): boolean {
    if (this.level >= this.rungs.length) return false;
    this.rungs[this.level].down();
    this.level++;
    return true;
  }

  stepUp(): boolean {
    if (this.level <= 0) return false;
    this.level--;
    this.rungs[this.level].up();
    return true;
  }

  reset(): void {
    while (this.stepUp());
    this.badWindows = 0;
    this.goodWindows = 0;
    this.framesInWindow = 0;
  }
}
