import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_STEP,
  Input,
  loadRapier,
  PhysicsWorld,
  placeAt,
  Transform,
  type UpdateContext,
  World,
} from '@faisca/runtime';
import {
  makeSpeedCharacter,
  Partida,
  SpeedCharacter,
  speedCharacterSystem,
} from '@faisca/kit-velocidade';
import { Patroller, patrollerSystem, resetPatrollers } from '../src/index.ts';

await loadRapier();

/**
 * A regra do patrulheiro cabe numa frase — por cima ele morre, por baixo voce
 * se machuca — e e justamente por caber numa frase que ela nao pode ter
 * excecao. Estes testes cobram os dois lados dela.
 */
function montar() {
  const mundo = new World();
  mundo.clear();

  const fisica = new PhysicsWorld();
  fisica.addBox({ x: 400, y: 1, z: 400 }, { position: { x: 0, y: -1, z: 0 } });

  const partida = new Partida();
  const entrada = new Input({ target: null, getGamepads: () => [] });
  const personagem = speedCharacterSystem({
    camera: new THREE.PerspectiveCamera(),
    input: entrada,
    physics: fisica,
  });
  const inimigos = patrollerSystem({ partida });

  const heroi = mundo.create();
  const ts = placeAt(heroi, 0, 0.62, 0);
  const cs = makeSpeedCharacter(heroi);

  let numero = 0;
  return {
    mundo,
    partida,
    entrada,
    ts,
    cs,
    /** Um patrulheiro apoiado no chao, no ponto dado. */
    inimigo(x: number, z: number) {
      const entidade = mundo.create();
      const its = placeAt(entidade, x, 0, z);
      const ips = Patroller.add(entidade);
      return { entidade, ts: its, ps: ips };
    },
    passo(quantidade = 1) {
      for (let i = 0; i < quantidade; i++) {
        entrada.update();
        fisica.step(DEFAULT_STEP);
        const f = Transform.fields;
        f.px[ts] = f.x[ts];
        f.py[ts] = f.y[ts];
        f.pz[ts] = f.z[ts];
        const contexto: UpdateContext = {
          world: mundo,
          dt: DEFAULT_STEP,
          elapsed: numero * DEFAULT_STEP,
          step: numero,
          frame: numero,
          frameTime: DEFAULT_STEP,
          alpha: 1,
        };
        personagem.update(contexto);
        inimigos.update(contexto);
        numero++;
      }
    },
  };
}

describe('a ronda', () => {
  it('anda de um lado para o outro sem sair do trecho', () => {
    const cena = montar();
    const bicho = cena.inimigo(0, 30); // longe do heroi
    Patroller.fields.range[bicho.ps] = 4;
    Patroller.fields.speed[bicho.ps] = 6;

    let menor = Infinity;
    let maior = -Infinity;
    for (let i = 0; i < 300; i++) {
      cena.passo(1);
      const z = Transform.fields.z[bicho.ts];
      menor = Math.min(menor, z);
      maior = Math.max(maior, z);
    }

    // Guinada zero: a ronda acompanha o eixo Z, quatro para cada lado.
    expect(maior).toBeCloseTo(34, 1);
    expect(menor).toBeCloseTo(26, 1);
    cena.mundo.clear();
  });

  it('a ronda segue a guinada da peça', () => {
    const cena = montar();
    const bicho = cena.inimigo(0, 30);
    // Um quarto de volta: ele passa a andar no eixo X.
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    Transform.fields.qy[bicho.ts] = giro.y;
    Transform.fields.qw[bicho.ts] = giro.w;

    cena.passo(60);
    expect(Math.abs(Transform.fields.x[bicho.ts])).toBeGreaterThan(2);
    expect(Transform.fields.z[bicho.ts]).toBeCloseTo(30, 1);
    cena.mundo.clear();
  });
});

describe('encostar no patrulheiro', () => {
  it('por cima ele morre, e o personagem quica', () => {
    const cena = montar();
    const bicho = cena.inimigo(0, 0);
    Patroller.fields.speed[bicho.ps] = 0;

    // Caindo bem em cima dele.
    Transform.fields.y[cena.ts] = 2.4;
    SpeedCharacter.fields.vy[cena.cs] = -6;
    SpeedCharacter.fields.grounded[cena.cs] = 0;
    SpeedCharacter.fields.noStick[cena.cs] = 0.3;
    cena.passo(1);

    expect(Patroller.fields.alive[bicho.ps]).toBe(0);
    expect(SpeedCharacter.fields.vy[cena.cs]).toBeGreaterThan(10);
    expect(cena.partida.vidas).toBe(3);
    cena.mundo.clear();
  });

  it('de lado ele machuca, e os anéis pagam', () => {
    const cena = montar();
    const bicho = cena.inimigo(0, 0);
    Patroller.fields.speed[bicho.ps] = 0;
    cena.partida.coletar(7);

    cena.passo(1);

    expect(Patroller.fields.alive[bicho.ps]).toBe(1);
    expect(cena.partida.aneis).toBe(0);
    expect(cena.partida.vidas).toBe(3);
    expect(cena.partida.invulneravel).toBeGreaterThan(0);
    cena.mundo.clear();
  });

  it('sem anel, encostar de lado custa uma vida', () => {
    const cena = montar();
    const bicho = cena.inimigo(0, 0);
    Patroller.fields.speed[bicho.ps] = 0;

    cena.passo(1);
    expect(cena.partida.vidas).toBe(2);
    cena.mundo.clear();
  });

  it('inimigo derrotado não machuca mais', () => {
    const cena = montar();
    const bicho = cena.inimigo(0, 0);
    Patroller.fields.speed[bicho.ps] = 0;
    Patroller.fields.alive[bicho.ps] = 0;

    cena.passo(20);
    expect(cena.partida.vidas).toBe(3);
    expect(cena.partida.aneis).toBe(0);
    cena.mundo.clear();
  });

  it('parar o teste levanta os inimigos derrotados', () => {
    const cena = montar();
    const bicho = cena.inimigo(0, 0);
    Patroller.fields.alive[bicho.ps] = 0;
    Patroller.fields.offset[bicho.ps] = 3;

    resetPatrollers();
    expect(Patroller.fields.alive[bicho.ps]).toBe(1);
    expect(Patroller.fields.offset[bicho.ps]).toBe(0);
    cena.mundo.clear();
  });
});
