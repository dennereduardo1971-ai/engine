import { describe, expect, it } from 'vitest';
import { applyDeadzone, Input, type GamepadLike } from '../src/input/input.ts';
import { XBOX } from '../src/input/bindings.ts';

function controle(estado: {
  axes?: number[];
  botoes?: number[];
  id?: string;
}): GamepadLike {
  const apertados = new Set(estado.botoes ?? []);
  return {
    id: estado.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD)',
    connected: true,
    axes: estado.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, (_, i) => ({
      pressed: apertados.has(i),
      value: apertados.has(i) ? 1 : 0,
    })),
  };
}

function semJanela(getGamepads: () => (GamepadLike | null)[] = () => []): Input {
  return new Input({ target: null, getGamepads });
}

describe('zona morta', () => {
  it('zera o tremor do analogico parado', () => {
    expect(applyDeadzone(0.1, 0.05, 0.22)).toEqual({ x: 0, y: 0 });
  });

  it('comeca do zero depois da zona morta, sem degrau', () => {
    const logo_depois = applyDeadzone(0.23, 0, 0.22);
    expect(logo_depois.x).toBeGreaterThan(0);
    expect(logo_depois.x).toBeLessThan(0.05);
  });

  it('mantem o analogico redondo, nao quadrado', () => {
    // Fim de curso na diagonal tem que valer 1, como no eixo puro — senao a
    // diagonal viraria mais rapida que a reta.
    const diagonal = applyDeadzone(Math.SQRT1_2, Math.SQRT1_2, 0.22);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 5);
  });
});

describe('controle de Xbox', () => {
  it('le o analogico esquerdo como o eixo de andar', () => {
    const entrada = semJanela(() => [controle({ axes: [1, -1, 0, 0] })]);
    entrada.update();
    const mover = entrada.axis('move');
    expect(mover.x).toBeCloseTo(Math.SQRT1_2, 2);
    expect(mover.y).toBeCloseTo(-Math.SQRT1_2, 2);
  });

  it('le o botao A como pular, e enxerga a borda uma vez so', () => {
    let apertado = false;
    const entrada = semJanela(() => [controle({ botoes: apertado ? [XBOX.A] : [] })]);

    entrada.update();
    expect(entrada.isDown('jump')).toBe(false);

    apertado = true;
    entrada.update();
    expect(entrada.justPressed('jump')).toBe(true);
    expect(entrada.isDown('jump')).toBe(true);

    entrada.update();
    expect(entrada.justPressed('jump')).toBe(false); // segurar nao e apertar de novo
    expect(entrada.isDown('jump')).toBe(true);

    apertado = false;
    entrada.update();
    expect(entrada.justReleased('jump')).toBe(true);
  });

  it('aceita o gatilho analogico a partir da metade do curso', () => {
    const meio: GamepadLike = {
      id: 'Xbox',
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, (_, i) => ({
        pressed: false,
        value: i === XBOX.RT ? 0.8 : 0,
      })),
    };
    const entrada = semJanela(() => [meio]);
    entrada.update();
    expect(entrada.isDown('roll')).toBe(true);
  });

  it('usa o d-pad quando o analogico esta no centro', () => {
    const entrada = semJanela(() => [controle({ botoes: [XBOX.DIREITA] })]);
    entrada.update();
    expect(entrada.axis('move')).toEqual({ x: 1, y: 0 });
  });

  it('avisa qual controle esta conectado, e quando nao ha nenhum', () => {
    let ligado = true;
    const entrada = semJanela(() => (ligado ? [controle({ id: 'Xbox 360 Controller' })] : [null]));
    entrada.update();
    expect(entrada.gamepadId).toBe('Xbox 360 Controller');
    ligado = false;
    entrada.update();
    expect(entrada.gamepadId).toBe(null);
  });
});

describe('teclado', () => {
  it('anda com WASD', () => {
    const entrada = semJanela();
    entrada.setKey('KeyW', true);
    entrada.update();
    expect(entrada.axis('move')).toEqual({ x: 0, y: -1 });
  });

  it('nao deixa a diagonal mais rapida que a reta', () => {
    const entrada = semJanela();
    entrada.setKey('KeyW', true);
    entrada.setKey('KeyD', true);
    entrada.update();
    const mover = entrada.axis('move');
    expect(Math.hypot(mover.x, mover.y)).toBeCloseTo(1, 5);
  });

  it('o controle tem preferencia sobre a tecla', () => {
    const entrada = semJanela(() => [controle({ axes: [-1, 0, 0, 0] })]);
    entrada.setKey('KeyD', true);
    entrada.update();
    expect(entrada.axis('move').x).toBeLessThan(0);
  });

  it('pula com espaco', () => {
    const entrada = semJanela();
    entrada.setKey('Space', true);
    entrada.update();
    expect(entrada.justPressed('jump')).toBe(true);
  });
});
