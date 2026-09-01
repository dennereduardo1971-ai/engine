import { defineSystem, type System } from '@faisca/runtime';
import { type Partida } from './partida.ts';

/**
 * O HUD do jogo: aneis, vidas, tempo e o fim da fase.
 *
 * Ele e feito de HTML por cima do canvas, e nao desenhado em 3D. Assim ele
 * nao custa nada do orcamento de render, ele e legivel em qualquer resolucao
 * (inclusive nos 540p para onde a qualidade adaptativa desce), e ele ja nasce
 * com contraste e tamanho de fonte que uma crianca de seis anos le.
 *
 * O editor de interface por arrastar da M9 vai substituir isto por algo que a
 * mae monta sozinha. Ate la, este HUD e o suficiente para a fase ter comeco,
 * meio e fim.
 */

const CSS = `
.faisca-hud-jogo {
  position: absolute; inset: 0; z-index: 20; pointer-events: none;
  font: 600 15px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.65);
}
.faisca-hud-jogo .placar {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 22px; align-items: center;
  padding: 9px 20px; border-radius: 999px;
  background: rgba(14,17,23,0.72); border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(8px);
}
.faisca-hud-jogo .item { display: flex; align-items: center; gap: 7px; font-variant-numeric: tabular-nums; }
.faisca-hud-jogo .item b { font-size: 21px; font-weight: 700; letter-spacing: -0.3px; }
.faisca-hud-jogo .anel b { color: #f5c542; }
.faisca-hud-jogo .vidas b { color: #ff8f6b; }
.faisca-hud-jogo .icone { font-size: 17px; }
.faisca-hud-jogo .machucou { animation: faisca-pisca 0.25s steps(2) infinite; }
@keyframes faisca-pisca { to { opacity: 0.35; } }

.faisca-hud-jogo .fim {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: rgba(8,10,14,0.62); backdrop-filter: blur(3px);
}
/*
 * O atributo "hidden" do HTML vale como "display: none", mas so como regra do
 * navegador — a regra acima, com "display: grid", ganha dela. Sem esta linha o
 * veu de fim de fase fica ligado o jogo inteiro, escurecendo a tela.
 * (Sem crase neste comentario: ele mora dentro de um template literal.)
 */
.faisca-hud-jogo .fim[hidden] { display: none; }
.faisca-hud-jogo .cartao {
  min-width: 300px; padding: 28px 34px; text-align: center; border-radius: 18px;
  background: rgba(20,25,35,0.94); border: 1px solid rgba(255,255,255,0.14);
}
.faisca-hud-jogo .cartao h2 { margin: 0 0 4px; font-size: 30px; letter-spacing: -0.6px; }
.faisca-hud-jogo .cartao p { margin: 0 0 16px; font-size: 14px; font-weight: 400; opacity: 0.7; }
.faisca-hud-jogo .cartao .linha {
  display: flex; justify-content: space-between; gap: 26px;
  padding: 7px 0; font-size: 15px; border-top: 1px solid rgba(255,255,255,0.1);
}
.faisca-hud-jogo .cartao .linha span:last-child { font-variant-numeric: tabular-nums; font-weight: 700; }
.faisca-hud-jogo .venceu h2 { color: #4ade80; }
.faisca-hud-jogo .perdeu h2 { color: #f87171; }
.faisca-hud-jogo .recado {
  position: absolute; left: 50%; bottom: 15%; transform: translateX(-50%);
  max-width: 70%; padding: 12px 20px; border-radius: 12px; text-align: center;
  font-size: 17px; background: rgba(20,25,35,0.92);
  border: 1px solid rgba(255,255,255,0.16);
}
.faisca-hud-jogo .recado[hidden] { display: none; }
.faisca-hud-jogo .recorde { color: #f5c542; font-size: 13px; margin-top: 12px; }
`;

export interface GameHudOptions {
  /** Texto do rodape do cartao de fim de fase. */
  dica?: string;
}

export class GameHud {
  readonly element: HTMLDivElement;
  private readonly aneis: HTMLElement;
  private readonly vidas: HTMLElement;
  private readonly tempo: HTMLElement;
  private readonly placar: HTMLElement;
  private readonly fim: HTMLElement;
  private readonly recado: HTMLElement;
  private recadoAte = 0;
  private estadoMostrado: string | null = null;
  /** Texto extra no cartao de fim: recorde novo, por exemplo. */
  recorde = '';

  constructor(
    private readonly partida: Partida,
    parent: HTMLElement = document.body,
    private readonly options: GameHudOptions = {},
  ) {
    if (!document.getElementById('faisca-hud-jogo-estilo')) {
      const style = document.createElement('style');
      style.id = 'faisca-hud-jogo-estilo';
      style.textContent = CSS;
      document.head.append(style);
    }

    this.element = document.createElement('div');
    this.element.className = 'faisca-hud-jogo';
    this.element.innerHTML = `
      <div class="placar">
        <span class="item anel"><span class="icone">💍</span><b data-aneis>0</b></span>
        <span class="item vidas"><span class="icone">❤️</span><b data-vidas>3</b></span>
        <span class="item"><span class="icone">⏱️</span><b data-tempo>0:00</b></span>
      </div>
      <div class="recado" hidden></div>
      <div class="fim" hidden></div>`;
    parent.append(this.element);

    this.aneis = this.element.querySelector('[data-aneis]') as HTMLElement;
    this.vidas = this.element.querySelector('[data-vidas]') as HTMLElement;
    this.tempo = this.element.querySelector('[data-tempo]') as HTMLElement;
    this.placar = this.element.querySelector('.placar') as HTMLElement;
    this.fim = this.element.querySelector('.fim') as HTMLElement;
    this.recado = this.element.querySelector('.recado') as HTMLElement;
  }

  /** O sistema que redesenha o HUD. Ultima coisa da fase de render. */
  system(): System {
    return defineSystem({
      name: 'GameHud',
      phase: 'render',
      order: 900,
      update: () => this.refresh(),
    });
  }

  /**
   * Mostra um recado por alguns segundos — e para onde vai o bloco "dizer".
   *
   * O tempo corre pelo relogio da partida, e nao por um `setTimeout`: assim o
   * recado congela junto com o jogo quando alguem aperta Pausar.
   */
  dizer(texto: string, segundos = 3): void {
    this.recado.textContent = texto;
    this.recado.hidden = texto.length === 0;
    this.recadoAte = this.partida.tempo + segundos;
  }

  refresh(): void {
    const p = this.partida;
    if (!this.recado.hidden && p.tempo > this.recadoAte) this.recado.hidden = true;
    this.aneis.textContent = String(p.aneis);
    this.vidas.textContent = String(p.vidas);
    this.tempo.textContent = formatarTempo(p.tempo);
    this.placar.classList.toggle('machucou', p.invulneravel > 0);

    // Redesenha o cartao so quando o estado muda: o fim de fase e uma tela
    // parada, e refazer o HTML dela a 60 fps seria trabalho puro.
    if (this.estadoMostrado === p.estado) return;
    this.estadoMostrado = p.estado;

    if (p.estado === 'jogando') {
      this.fim.hidden = true;
      this.fim.innerHTML = '';
      return;
    }

    const venceu = p.estado === 'venceu';
    this.fim.hidden = false;
    this.fim.innerHTML = `
      <div class="cartao ${venceu ? 'venceu' : 'perdeu'}">
        <h2>${venceu ? 'Você chegou!' : 'Acabaram as vidas'}</h2>
        <p>${venceu ? 'Fase completa' : 'Tente de novo'}</p>
        <div class="linha"><span>Anéis</span><span>${p.aneis}</span></div>
        <div class="linha"><span>Tempo</span><span>${formatarTempo(p.tempo)}</span></div>
        <div class="linha"><span>Tombos</span><span>${p.quedas}</span></div>
        ${this.recorde ? `<div class="recorde">${this.recorde}</div>` : ''}
        ${this.options.dica ? `<p style="margin:14px 0 0">${this.options.dica}</p>` : ''}
      </div>`;
  }

  /** Forca o cartao a ser redesenhado na proxima atualizacao. */
  invalidar(): void {
    this.estadoMostrado = null;
  }

  dispose(): void {
    this.element.remove();
  }
}

/** Segundos em minutos:segundos, como todo jogo mostra. */
export function formatarTempo(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const minutos = Math.floor(total / 60);
  return `${minutos}:${String(total % 60).padStart(2, '0')}`;
}
