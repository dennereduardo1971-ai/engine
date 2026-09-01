/**
 * Mapeamento de controles.
 *
 * Uma acao tem nome ("pular") e nao tecla. Quem escreve o jogo pergunta "o
 * jogador quer pular?", nunca "o botao A esta apertado?". E isso que permite o
 * remapeamento total de controles que a secao 13 do plano promete, e e isso
 * que faz o mesmo jogo funcionar no controle e no teclado sem mudar uma linha.
 */

/** Um eixo de duas dimensoes: analogico, WASD, setas, d-pad. */
export interface AxisBinding {
  /** Indices dos eixos no controle padrao. */
  gamepadAxes?: { x: number; y: number };
  /** Botoes do controle que valem como direcao (d-pad). */
  gamepadButtons?: { up: number; down: number; left: number; right: number };
  /** Teclas, pelo `code` do evento (independente do layout do teclado). */
  keys?: { up: string[]; down: string[]; left: string[]; right: string[] };
  /** Usa o movimento do mouse (precisa de ponteiro travado). */
  mouseMotion?: boolean;
  /** Zona morta radial do analogico. */
  deadzone?: number;
  /** Multiplicador aplicado depois da zona morta. */
  sensitivity?: number;
  invertY?: boolean;
}

export interface ButtonBinding {
  gamepadButtons?: number[];
  keys?: string[];
  mouseButtons?: number[];
}

export interface Bindings {
  axes: Record<string, AxisBinding>;
  buttons: Record<string, ButtonBinding>;
}

/**
 * Controle de Xbox, layout padrao do navegador (Standard Gamepad).
 *
 *   eixos   0,1 analogico esquerdo   2,3 analogico direito
 *   botoes  0 A   1 B   2 X   3 Y   4 LB  5 RB  6 LT  7 RT
 *           8 Ver 9 Menu 10 L3 11 R3 12 cima 13 baixo 14 esq 15 dir
 *
 * O controle de Xbox vem primeiro porque e o que a casa tem (secao 2 do plano).
 */
export const XBOX = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VER: 8,
  MENU: 9,
  L3: 10,
  R3: 11,
  CIMA: 12,
  BAIXO: 13,
  ESQUERDA: 14,
  DIREITA: 15,
} as const;

/** Mapeamento de fabrica. O jogador pode trocar tudo. */
export function defaultBindings(): Bindings {
  return {
    axes: {
      move: {
        gamepadAxes: { x: 0, y: 1 },
        gamepadButtons: {
          up: XBOX.CIMA,
          down: XBOX.BAIXO,
          left: XBOX.ESQUERDA,
          right: XBOX.DIREITA,
        },
        keys: {
          up: ['KeyW', 'ArrowUp'],
          down: ['KeyS', 'ArrowDown'],
          left: ['KeyA', 'ArrowLeft'],
          right: ['KeyD', 'ArrowRight'],
        },
        deadzone: 0.22,
      },
      look: {
        gamepadAxes: { x: 2, y: 3 },
        keys: {
          up: ['KeyI'],
          down: ['KeyK'],
          left: ['KeyJ'],
          right: ['KeyL'],
        },
        mouseMotion: true,
        deadzone: 0.18,
        sensitivity: 1,
      },
    },
    buttons: {
      jump: { gamepadButtons: [XBOX.A], keys: ['Space'] },
      roll: { gamepadButtons: [XBOX.RT, XBOX.LT, XBOX.X], keys: ['ShiftLeft', 'ShiftRight'] },
      action: { gamepadButtons: [XBOX.B], keys: ['KeyE'], mouseButtons: [0] },
      pause: { gamepadButtons: [XBOX.MENU], keys: ['Escape'] },
    },
  };
}
