import { type Engine } from '../engine.ts';
import { BUDGET } from '../loop/profiler.ts';
import { defineSystem, type System } from '../ecs/system.ts';

interface Row {
  root: HTMLDivElement;
  value: HTMLSpanElement;
  bar: HTMLDivElement;
}

const CSS = `
.faisca-hud {
  position: absolute; top: 12px; left: 12px; z-index: 10;
  min-width: 232px; padding: 10px 12px;
  font: 12px/1.45 ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace;
  color: #e6e9f0; background: rgba(14, 17, 23, 0.82);
  border: 1px solid rgba(255,255,255,0.09); border-radius: 10px;
  backdrop-filter: blur(6px); user-select: none; pointer-events: none;
}
.faisca-hud h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.4px; }
.faisca-hud h1 small { font-size: 11px; font-weight: 400; opacity: 0.55; margin-left: 6px; }
.faisca-hud-row { display: grid; grid-template-columns: 62px 1fr 74px; gap: 8px; align-items: center; margin-top: 3px; }
.faisca-hud-row span:first-child { opacity: 0.6; }
.faisca-hud-track { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
.faisca-hud-bar { height: 100%; width: 0%; border-radius: 3px; background: #4ade80; transition: width 90ms linear; }
.faisca-hud-value { text-align: right; font-variant-numeric: tabular-nums; }
.faisca-hud-foot { margin-top: 8px; padding-top: 7px; border-top: 1px solid rgba(255,255,255,0.09); opacity: 0.62; font-size: 11px; }
.faisca-hud-foot div { display: flex; justify-content: space-between; gap: 10px; }
.faisca-ok { color: #4ade80; } .faisca-warn { color: #fbbf24; } .faisca-bad { color: #f87171; }
`;

/**
 * O contador de fps do M0: mostra, ao vivo, quanto de cada orcamento da secao
 * 3 do plano ja foi gasto. Verde e folga, amarelo e no limite, vermelho
 * estourou. E com isso que da para olhar para a maquina da casa e dizer, com
 * numero na mao, se ela aguenta.
 */
export class PerfHud {
  readonly element: HTMLDivElement;
  private readonly rows: Record<string, Row> = {};
  private readonly fpsValue: HTMLElement;
  private readonly fpsNote: HTMLElement;
  private readonly foot: HTMLElement;
  private frames = 0;

  constructor(
    private readonly engine: Engine,
    parent: HTMLElement = document.body,
    private readonly interval = 10,
  ) {
    if (!document.getElementById('faisca-hud-style')) {
      const style = document.createElement('style');
      style.id = 'faisca-hud-style';
      style.textContent = CSS;
      document.head.append(style);
    }

    this.element = document.createElement('div');
    this.element.className = 'faisca-hud';
    this.element.innerHTML = `<h1><span data-fps>--</span> fps<small data-note></small></h1>`;
    for (const [key, label] of [
      ['total', 'quadro'],
      ['logic', 'logica'],
      ['physics', 'fisica'],
      ['render', 'render'],
    ] as const) {
      this.rows[key] = this.addRow(label);
    }
    this.foot = document.createElement('div');
    this.foot.className = 'faisca-hud-foot';
    this.element.append(this.foot);
    parent.append(this.element);

    this.fpsValue = this.element.querySelector('[data-fps]') as HTMLElement;
    this.fpsNote = this.element.querySelector('[data-note]') as HTMLElement;
  }

  /** O sistema que atualiza o painel. Roda por ultimo na fase de render. */
  system(): System {
    return defineSystem({
      name: 'PerfHud',
      phase: 'render',
      order: 1000,
      update: () => {
        if (++this.frames < this.interval) return;
        this.frames = 0;
        this.refresh();
      },
    });
  }

  refresh(): void {
    const { profiler, renderer, quality, world } = this.engine;
    const fps = profiler.fps;
    this.fpsValue.textContent = fps > 0 ? fps.toFixed(0) : '--';
    this.fpsValue.className = fps >= 58 ? 'faisca-ok' : fps >= 45 ? 'faisca-warn' : 'faisca-bad';
    this.fpsNote.textContent = `qualidade: ${quality.currentRung}`;

    this.setRow('total', profiler.total.average, BUDGET.frame);
    this.setRow('logic', profiler.phases.logic.average, BUDGET.logic);
    this.setRow('physics', profiler.phases.physics.average, BUDGET.physics);
    this.setRow('render', profiler.phases.render.average, BUDGET.render);

    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const report = renderer.report();
    this.foot.innerHTML = [
      pair('desenhos', `${profiler.drawCalls} / ${BUDGET.drawCalls}`, profiler.drawCalls > BUDGET.drawCalls),
      pair(
        'triangulos',
        `${format(profiler.triangles)} / ${format(BUDGET.triangles)}`,
        profiler.triangles > BUDGET.triangles,
      ),
      pair('entidades', format(world.count), false),
      pair('escala', `${Math.round(renderer.renderScale * 100)}%`, renderer.renderScale < 1),
      memory ? pair('memoria', `${(memory.usedJSHeapSize / 1048576).toFixed(0)} MB`, false) : '',
      pair('grafico', report.backend === 'webgl2' ? 'WebGL2' : 'WebGL', false),
    ].join('');
  }

  dispose(): void {
    this.element.remove();
  }

  private addRow(label: string): Row {
    const root = document.createElement('div');
    root.className = 'faisca-hud-row';
    root.innerHTML = `<span>${label}</span><div class="faisca-hud-track"><div class="faisca-hud-bar"></div></div><span class="faisca-hud-value">--</span>`;
    this.element.append(root);
    return {
      root,
      bar: root.querySelector('.faisca-hud-bar') as HTMLDivElement,
      value: root.querySelector('.faisca-hud-value') as HTMLSpanElement,
    };
  }

  private setRow(key: string, milliseconds: number, budget: number): void {
    const row = this.rows[key];
    if (!row) return;
    const share = budget > 0 ? milliseconds / budget : 0;
    row.bar.style.width = `${Math.min(100, share * 100).toFixed(0)}%`;
    const color = share > 1 ? '#f87171' : share > 0.85 ? '#fbbf24' : '#4ade80';
    row.bar.style.background = color;
    row.value.textContent = `${milliseconds.toFixed(2)} / ${budget}`;
    row.value.style.color = share > 1 ? '#f87171' : '';
  }
}

function pair(label: string, value: string, bad: boolean): string {
  return `<div><span>${label}</span><span class="${bad ? 'faisca-bad' : ''}">${value}</span></div>`;
}

function format(value: number): string {
  return value.toLocaleString('pt-BR');
}
