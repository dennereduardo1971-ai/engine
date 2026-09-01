/** Passo fixo padrao: 60 passos de simulacao por segundo. */
export const DEFAULT_STEP = 1 / 60;

export interface LoopOptions {
  /** Passo fixo da simulacao, em segundos. */
  step?: number;
  /**
   * Maximo de passos que o laco tenta recuperar num quadro so. Sem esse teto,
   * um travamento de 2 s viraria 120 passos seguidos, que travam de novo, que
   * geram mais passos: a espiral da morte.
   */
  maxCatchUp?: number;
  /** Um passo fixo de simulacao. */
  onFixed(step: number, elapsed: number, dt: number): void;
  /** Um quadro desenhado. `alpha` interpola entre o passo anterior e o atual. */
  onRender(alpha: number, frameTime: number): void;
  /** Relogio, injetavel para teste. */
  now?: () => number;
  /** Agendador de quadro, injetavel para teste (padrao: requestAnimationFrame). */
  request?: (callback: (time: number) => void) => number;
  cancel?: (handle: number) => void;
}

/**
 * Laco de jogo com passo fixo e render interpolado.
 *
 * A simulacao anda sempre de 16,6 ms em 16,6 ms, aconteca o que acontecer com
 * a maquina. So assim a fisica de momentum do Kit Velocidade se comporta igual
 * num PC rapido e num PC lento — um Sonic que pula mais alto quando o fps cai
 * seria um jogo diferente a cada maquina.
 */
export class Loop {
  private readonly step: number;
  private readonly maxCatchUp: number;
  private readonly nowFn: () => number;
  private readonly requestFn: (callback: (time: number) => void) => number;
  private readonly cancelFn: (handle: number) => void;
  private readonly onFixed: LoopOptions['onFixed'];
  private readonly onRender: LoopOptions['onRender'];

  private handle: number | null = null;
  private accumulator = 0;
  private lastTime = 0;

  running = false;
  stepCount = 0;
  elapsed = 0;

  /**
   * Simulacao congelada: o laco continua desenhando, mas nao avanca passos
   * fixos. E o pause do teste ao vivo do editor (secao 8 do plano) — a cena
   * fica parada na tela, e nao preta.
   */
  paused = false;

  constructor(options: LoopOptions) {
    this.step = options.step ?? DEFAULT_STEP;
    this.maxCatchUp = options.maxCatchUp ?? 5;
    this.onFixed = options.onFixed;
    this.onRender = options.onRender;
    this.nowFn = options.now ?? (() => performance.now());
    this.requestFn =
      options.request ??
      ((callback) => requestAnimationFrame(callback));
    this.cancelFn = options.cancel ?? ((handle) => cancelAnimationFrame(handle));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.nowFn();
    this.accumulator = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) {
      this.cancelFn(this.handle);
      this.handle = null;
    }
  }

  /**
   * Roda um quadro com o relogio no instante `time` (ms). Publico para que o
   * teste de orcamento possa dirigir o laco sem navegador.
   */
  advance(time: number): void {
    let frameTime = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (!Number.isFinite(frameTime) || frameTime < 0) frameTime = 0;

    // Aba em segundo plano, janela arrastada, breakpoint no depurador: o
    // relogio pula. Descarta o salto em vez de simular meia hora de uma vez.
    const maxFrame = this.step * this.maxCatchUp;
    if (frameTime > maxFrame) frameTime = maxFrame;

    if (this.paused) {
      // Sem acumular tempo enquanto parado: senao despausar dispararia de uma
      // vez todos os passos do tempo em que o jogador ficou olhando a cena.
      this.accumulator = 0;
      this.onRender(1, frameTime);
      return;
    }

    this.accumulator += frameTime;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxCatchUp) {
      this.onFixed(this.stepCount, this.elapsed, this.step);
      this.stepCount++;
      this.elapsed += this.step;
      this.accumulator -= this.step;
      steps++;
    }

    this.onRender(this.accumulator / this.step, frameTime);
  }

  /**
   * Avanca exatamente um passo fixo, esteja o laco parado ou nao. E o
   * passo-a-passo do editor: da para ver o quadro seguinte da simulacao sem
   * soltar o jogo.
   */
  stepOnce(): void {
    this.onFixed(this.stepCount, this.elapsed, this.step);
    this.stepCount++;
    this.elapsed += this.step;
  }

  private schedule(): void {
    this.handle = this.requestFn((time) => {
      if (!this.running) return;
      this.advance(time);
      this.schedule();
    });
  }
}
