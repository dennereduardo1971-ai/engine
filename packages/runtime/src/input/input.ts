import { type AxisBinding, type Bindings, defaultBindings } from './bindings.ts';

export interface Vec2 {
  x: number;
  y: number;
}

/** O minimo de um controle que a engine precisa enxergar. */
export interface GamepadLike {
  readonly id: string;
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export interface InputOptions {
  bindings?: Bindings;
  /** Onde ouvir teclado e mouse. Padrao: `window`. */
  target?: EventTarget | null;
  /** De onde vem os controles. Padrao: `navigator.getGamepads()`. */
  getGamepads?: () => (GamepadLike | null)[];
  /** Quanto do movimento do mouse vale um eixo cheio. */
  mouseSensitivity?: number;
}

const ZERO: Vec2 = { x: 0, y: 0 };

/**
 * A entrada do jogador, em acoes com nome.
 *
 * `update()` e chamado uma vez por passo fixo, antes dos sistemas. E ali que
 * as bordas ("acabou de apertar", "acabou de soltar") sao calculadas — assim
 * elas casam com a simulacao e nao se perdem nem se repetem quando o fps
 * oscila.
 */
export class Input {
  bindings: Bindings;

  private readonly keys = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private mouseDelta: Vec2 = { x: 0, y: 0 };
  private readonly axes = new Map<string, Vec2>();
  private readonly down = new Map<string, boolean>();
  private readonly wasDown = new Map<string, boolean>();
  private readonly getGamepads: () => (GamepadLike | null)[];
  private readonly mouseSensitivity: number;
  private readonly target: EventTarget | null;
  private readonly listeners: [string, EventListener][] = [];

  /** Nome do controle conectado, ou null se so ha teclado. */
  gamepadId: string | null = null;

  constructor(options: InputOptions = {}) {
    this.bindings = options.bindings ?? defaultBindings();
    this.mouseSensitivity = options.mouseSensitivity ?? 0.055;
    this.target =
      options.target !== undefined
        ? options.target
        : typeof window === 'undefined'
          ? null
          : window;
    this.getGamepads =
      options.getGamepads ??
      (() =>
        typeof navigator === 'undefined' || !navigator.getGamepads
          ? []
          : (navigator.getGamepads() as (GamepadLike | null)[]));

    if (this.target) this.attach(this.target);
  }

  /** Le o estado dos controles e recalcula acoes. Uma vez por passo fixo. */
  update(): void {
    const gamepad = this.pickGamepad();
    this.gamepadId = gamepad?.id ?? null;

    for (const [name, binding] of Object.entries(this.bindings.axes)) {
      this.axes.set(name, this.readAxis(binding, gamepad));
    }

    for (const [name, binding] of Object.entries(this.bindings.buttons)) {
      this.wasDown.set(name, this.down.get(name) ?? false);
      let pressed = false;
      if (binding.keys) {
        for (const key of binding.keys) if (this.keys.has(key)) pressed = true;
      }
      if (!pressed && binding.mouseButtons) {
        for (const button of binding.mouseButtons) if (this.mouseButtons.has(button)) pressed = true;
      }
      if (!pressed && gamepad && binding.gamepadButtons) {
        for (const index of binding.gamepadButtons) {
          // Gatilhos analogicos (LT/RT) contam como apertados a partir da
          // metade do curso.
          const button = gamepad.buttons[index];
          if (button && (button.pressed || button.value > 0.5)) pressed = true;
        }
      }
      this.down.set(name, pressed);
    }

    this.mouseDelta = { x: 0, y: 0 };
  }

  /** Direcao de um eixo, ja com zona morta aplicada. */
  axis(name: string): Vec2 {
    return this.axes.get(name) ?? ZERO;
  }

  /** O botao esta apertado agora? */
  isDown(name: string): boolean {
    return this.down.get(name) ?? false;
  }

  /** O botao acabou de ser apertado neste passo? */
  justPressed(name: string): boolean {
    return (this.down.get(name) ?? false) && !(this.wasDown.get(name) ?? false);
  }

  /** O botao acabou de ser solto neste passo? */
  justReleased(name: string): boolean {
    return !(this.down.get(name) ?? false) && (this.wasDown.get(name) ?? false);
  }

  /** Injeta um estado de tecla (usado por teste e pela interface de toque). */
  setKey(code: string, pressed: boolean): void {
    if (pressed) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** Soma movimento de mouse manualmente (teste, ou controle por toque). */
  addMouseDelta(x: number, y: number): void {
    this.mouseDelta.x += x;
    this.mouseDelta.y += y;
  }

  dispose(): void {
    if (!this.target) return;
    for (const [type, listener] of this.listeners) {
      this.target.removeEventListener(type, listener);
    }
    this.listeners.length = 0;
  }

  private attach(target: EventTarget): void {
    const on = (type: string, listener: EventListener): void => {
      target.addEventListener(type, listener);
      this.listeners.push([type, listener]);
    };

    on('keydown', (event) => {
      const e = event as KeyboardEvent;
      if (e.repeat) return;
      this.keys.add(e.code);
      // Espaco e setas rolam a pagina: num jogo isso e sempre indesejado.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    on('keyup', (event) => this.keys.delete((event as KeyboardEvent).code));

    // Perder o foco com a tecla apertada deixaria o personagem correndo
    // sozinho para sempre.
    on('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });

    on('mousedown', (event) => this.mouseButtons.add((event as MouseEvent).button));
    on('mouseup', (event) => this.mouseButtons.delete((event as MouseEvent).button));
    on('mousemove', (event) => {
      const e = event as MouseEvent;
      this.mouseDelta.x += e.movementX ?? 0;
      this.mouseDelta.y += e.movementY ?? 0;
    });
  }

  private pickGamepad(): GamepadLike | null {
    const gamepads = this.getGamepads();
    for (const gamepad of gamepads) {
      if (gamepad && gamepad.connected) return gamepad;
    }
    return null;
  }

  private readAxis(binding: AxisBinding, gamepad: GamepadLike | null): Vec2 {
    let x = 0;
    let y = 0;

    if (gamepad && binding.gamepadAxes) {
      x = gamepad.axes[binding.gamepadAxes.x] ?? 0;
      y = gamepad.axes[binding.gamepadAxes.y] ?? 0;
      const result = applyDeadzone(x, y, binding.deadzone ?? 0.2);
      x = result.x;
      y = result.y;
    }

    if (x === 0 && y === 0 && gamepad && binding.gamepadButtons) {
      const b = binding.gamepadButtons;
      x = pressedValue(gamepad, b.right) - pressedValue(gamepad, b.left);
      y = pressedValue(gamepad, b.down) - pressedValue(gamepad, b.up);
    }

    if (x === 0 && y === 0 && binding.keys) {
      const k = binding.keys;
      x = (this.anyKey(k.right) ? 1 : 0) - (this.anyKey(k.left) ? 1 : 0);
      y = (this.anyKey(k.down) ? 1 : 0) - (this.anyKey(k.up) ? 1 : 0);
      // Na diagonal do teclado, normaliza: senao andar na diagonal seria 41%
      // mais rapido que andar reto.
      if (x !== 0 && y !== 0) {
        const inverse = 1 / Math.SQRT2;
        x *= inverse;
        y *= inverse;
      }
    }

    if (x === 0 && y === 0 && binding.mouseMotion) {
      x = clamp(this.mouseDelta.x * this.mouseSensitivity, -1, 1);
      y = clamp(this.mouseDelta.y * this.mouseSensitivity, -1, 1);
    }

    const sensitivity = binding.sensitivity ?? 1;
    return {
      x: x * sensitivity,
      y: (binding.invertY ? -y : y) * sensitivity,
    };
  }

  private anyKey(codes: readonly string[]): boolean {
    for (const code of codes) if (this.keys.has(code)) return true;
    return false;
  }
}

function pressedValue(gamepad: GamepadLike, index: number): number {
  const button = gamepad.buttons[index];
  return button && (button.pressed || button.value > 0.5) ? 1 : 0;
}

/**
 * Zona morta radial.
 *
 * Analogico de controle usado nunca volta exatamente ao centro: ele fica
 * tremendo perto de zero, e sem zona morta o personagem anda sozinho. Cortar
 * cada eixo separado deformaria o circulo do analogico em quadrado; por isso o
 * corte e no comprimento do vetor, e o que sobra e reescalado para que o
 * primeiro milimetro de movimento util comece do zero, e nao de um degrau.
 */
export function applyDeadzone(x: number, y: number, deadzone: number): Vec2 {
  const length = Math.hypot(x, y);
  if (length <= deadzone) return { x: 0, y: 0 };
  const scale = Math.min(1, (length - deadzone) / (1 - deadzone)) / length;
  return { x: x * scale, y: y * scale };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
