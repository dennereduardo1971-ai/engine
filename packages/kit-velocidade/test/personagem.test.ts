import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_STEP,
  Input,
  placeAt,
  Transform,
  World,
  type System,
  type UpdateContext,
} from '@faisca/runtime';
import { groundSpeed, makeSpeedCharacter, SpeedCharacter, speedCharacterSystem } from '../src/index.ts';

/**
 * O controlador de personagem e o sistema mais importante da engine, e o
 * plano ja avisa que acertar o "sentir" e o maior risco do projeto. Estes
 * testes nao julgam se esta gostoso de jogar — isso e no controle, na mao.
 * Eles travam o que da para afirmar com numero: o teto de velocidade vale, o
 * atrito para, a derrapagem freia mais que o atrito, e as folgas do pulo
 * (coyote e buffer) fazem o que prometem.
 */

interface Cena {
  mundo: World;
  entrada: Input;
  sistema: System;
  heroi: number;
  ts: number;
  cs: number;
  passo(quantidade?: number): void;
}

function montar(): Cena {
  const mundo = new World();
  // Camera parada olhando para -Z: "para frente" e -Z, "direita" e +X.
  const camera = new THREE.PerspectiveCamera();
  const entrada = new Input({ target: null, getGamepads: () => [] });
  const sistema = speedCharacterSystem({ camera, input: entrada });

  const heroi = mundo.create();
  const ts = placeAt(heroi, 0, 0, 0);
  const cs = makeSpeedCharacter(heroi);

  let numero = 0;
  return {
    mundo,
    entrada,
    sistema,
    heroi,
    ts,
    cs,
    passo(quantidade = 1) {
      for (let i = 0; i < quantidade; i++) {
        entrada.update();
        const contexto: UpdateContext = {
          world: mundo,
          dt: DEFAULT_STEP,
          elapsed: numero * DEFAULT_STEP,
          step: numero,
          frame: numero,
          frameTime: DEFAULT_STEP,
          alpha: 1,
        };
        // Copia o passo anterior, como o sistema de historico faz na engine.
        const f = Transform.fields;
        f.px[ts] = f.x[ts];
        f.py[ts] = f.y[ts];
        f.pz[ts] = f.z[ts];
        sistema.update(contexto);
        numero++;
      }
    },
  };
}

describe('personagem veloz — chao', () => {
  it('acelera para onde o analogico aponta e respeita o teto', () => {
    const cena = montar();
    cena.entrada.setKey('KeyW', true);
    cena.passo(3);

    // Para frente e -Z.
    expect(Transform.fields.z[cena.ts]).toBeLessThan(0);
    expect(groundSpeed(cena.cs)).toBeGreaterThan(0);

    cena.passo(180); // tres segundos segurando
    const maxima = SpeedCharacter.fields.maxSpeed[cena.cs];
    expect(groundSpeed(cena.cs)).toBeCloseTo(maxima, 1);
    expect(groundSpeed(cena.cs)).toBeLessThanOrEqual(maxima + 0.001);
    cena.mundo.clear();
  });

  it('para com atrito quando o analogico volta ao centro', () => {
    const cena = montar();
    cena.entrada.setKey('KeyW', true);
    cena.passo(60);
    const correndo = groundSpeed(cena.cs);
    expect(correndo).toBeGreaterThan(10);

    cena.entrada.setKey('KeyW', false);
    cena.passo(90);
    expect(groundSpeed(cena.cs)).toBe(0);
    cena.mundo.clear();
  });

  it('derrapa: inverter correndo freia mais rapido do que so soltar', () => {
    const soltando = montar();
    soltando.entrada.setKey('KeyW', true);
    soltando.passo(60);
    const partida = groundSpeed(soltando.cs);
    soltando.entrada.setKey('KeyW', false);
    soltando.passo(10);
    const porAtrito = groundSpeed(soltando.cs);

    const invertendo = montar();
    invertendo.entrada.setKey('KeyW', true);
    invertendo.passo(60);
    invertendo.entrada.setKey('KeyW', false);
    invertendo.entrada.setKey('KeyS', true);
    invertendo.passo(10);
    const porDerrapagem = groundSpeed(invertendo.cs);

    expect(partida).toBeGreaterThan(10);
    expect(porDerrapagem).toBeLessThan(porAtrito);
    soltando.mundo.clear();
    invertendo.mundo.clear();
  });

  it('vira para onde esta indo', () => {
    const cena = montar();
    cena.entrada.setKey('KeyD', true); // direita = +X
    cena.passo(60);
    // Guinada 0 aponta para +Z; +X e um quarto de volta.
    expect(SpeedCharacter.fields.yaw[cena.cs]).toBeCloseTo(Math.PI / 2, 1);
    cena.mundo.clear();
  });
});

describe('personagem veloz — pulo', () => {
  it('sai do chao e volta para ele', () => {
    const cena = montar();
    cena.entrada.setKey('Space', true);
    cena.passo(1);
    cena.entrada.setKey('Space', false);
    cena.passo(10);

    expect(Transform.fields.y[cena.ts]).toBeGreaterThan(0.5);
    expect(SpeedCharacter.fields.grounded[cena.cs]).toBe(0);

    cena.passo(120);
    expect(Transform.fields.y[cena.ts]).toBe(0);
    expect(SpeedCharacter.fields.grounded[cena.cs]).toBe(1);
    cena.mundo.clear();
  });

  it('soltar o botao cedo faz um pulo mais baixo', () => {
    const curto = montar();
    curto.entrada.setKey('Space', true);
    curto.passo(1);
    curto.entrada.setKey('Space', false);
    curto.passo(60);
    let alturaCurta = 0;
    for (let i = 0; i < 60; i++) {
      alturaCurta = Math.max(alturaCurta, Transform.fields.y[curto.ts]);
      curto.passo(1);
    }

    const longo = montar();
    longo.entrada.setKey('Space', true);
    longo.passo(1);
    let alturaLonga = 0;
    for (let i = 0; i < 120; i++) {
      alturaLonga = Math.max(alturaLonga, Transform.fields.y[longo.ts]);
      longo.passo(1);
    }

    expect(alturaLonga).toBeGreaterThan(alturaCurta);
    curto.mundo.clear();
    longo.mundo.clear();
  });

  it('pula quem acabou de sair da beirada (coyote)', () => {
    const cena = montar();
    // Sai do chao sem pular, como quem anda para fora de uma plataforma.
    const f = SpeedCharacter.fields;
    Transform.fields.y[cena.ts] = 2;
    f.grounded[cena.cs] = 0;
    f.coyote[cena.cs] = 0.1;
    f.vy[cena.cs] = 0;

    cena.entrada.setKey('Space', true);
    cena.passo(1);
    expect(f.vy[cena.cs]).toBeGreaterThan(10);
    cena.mundo.clear();
  });

  it('nao pula quem esta no ar ha tempo', () => {
    const cena = montar();
    const f = SpeedCharacter.fields;
    Transform.fields.y[cena.ts] = 8;
    f.grounded[cena.cs] = 0;
    f.coyote[cena.cs] = 0;
    f.vy[cena.cs] = 0;

    cena.entrada.setKey('Space', true);
    cena.passo(1);
    expect(f.vy[cena.cs]).toBeLessThan(0); // so a gravidade
    cena.mundo.clear();
  });

  it('guarda o pulo apertado um pouquinho antes de encostar', () => {
    const cena = montar();
    const f = SpeedCharacter.fields;
    // Caindo, a um passo do chao.
    Transform.fields.y[cena.ts] = 0.2;
    f.grounded[cena.cs] = 0;
    f.coyote[cena.cs] = 0;
    f.vy[cena.cs] = -14;

    cena.entrada.setKey('Space', true);
    cena.passo(1); // apertou no ar: nao pula, mas fica guardado
    cena.entrada.setKey('Space', false);
    expect(Transform.fields.y[cena.ts]).toBe(0);

    cena.passo(1); // encostou: o pulo guardado sai
    expect(f.vy[cena.cs]).toBeGreaterThan(10);
    cena.mundo.clear();
  });
});
