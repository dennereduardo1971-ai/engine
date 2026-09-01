import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_STEP,
  type Entity,
  Input,
  loadRapier,
  PhysicsWorld,
  placeAt,
  Transform,
  type UpdateContext,
  World,
} from '@faisca/runtime';
import { makeSpeedCharacter, SpeedCharacter, speedCharacterSystem } from '../src/character.ts';
import {
  Collectible,
  Goal,
  resetTrackToys,
  Spring,
  trackToysSystem,
} from '../src/brinquedos.ts';
import { Partida } from '../src/partida.ts';

await loadRapier();

/** Onde o personagem nasce e para onde ele volta. */
const INICIO = { x: 0, y: 0.62, z: 0, yaw: 0 };

function montar() {
  const mundo = new World();
  mundo.clear();

  const fisica = new PhysicsWorld();
  fisica.addBox({ x: 400, y: 1, z: 400 }, { position: { x: 0, y: -1, z: 0 } });

  const partida = new Partida();
  const spawn = { ...INICIO };
  const entrada = new Input({ target: null, getGamepads: () => [] });
  const camera = new THREE.PerspectiveCamera();

  const personagem = speedCharacterSystem({ camera, input: entrada, physics: fisica });
  const brinquedos = trackToysSystem({ partida, spawn, deathY: -25 });

  const heroi = mundo.create();
  const ts = placeAt(heroi, INICIO.x, INICIO.y, INICIO.z);
  const cs = makeSpeedCharacter(heroi);

  let numero = 0;
  return {
    mundo,
    partida,
    entrada,
    heroi,
    ts,
    cs,
    /** Poe uma coisa no mundo, na posicao dada. */
    por(componente: typeof Collectible | typeof Spring | typeof Goal, x: number, y: number, z: number): Entity {
      const entidade = mundo.create();
      placeAt(entidade, x, y, z);
      componente.add(entidade);
      return entidade;
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
        brinquedos.update(contexto);
        numero++;
      }
    },
  };
}

describe('anel', () => {
  it('encostar pega, e some da vista', () => {
    const cena = montar();
    const anel = cena.por(Collectible, 0, 1.2, 0);
    cena.passo(2);

    expect(cena.partida.aneis).toBe(1);
    expect(Collectible.fields.collected[Collectible.slotOf(anel)]).toBe(1);
    // Escala zero: a instancia continua no lote, mas nao desenha nada.
    expect(Transform.fields.sx[Transform.slotOf(anel)]).toBe(0);
    cena.mundo.clear();
  });

  it('não dá para pegar o mesmo anel duas vezes', () => {
    const cena = montar();
    cena.por(Collectible, 0, 1.2, 0);
    cena.passo(30);
    expect(cena.partida.aneis).toBe(1);
    cena.mundo.clear();
  });

  it('anel longe não é pego', () => {
    const cena = montar();
    cena.por(Collectible, 20, 1.2, 0);
    cena.passo(5);
    expect(cena.partida.aneis).toBe(0);
    cena.mundo.clear();
  });

  it('parar o teste devolve os anéis', () => {
    const cena = montar();
    const anel = cena.por(Collectible, 0, 1.2, 0);
    cena.passo(2);
    expect(Collectible.fields.collected[Collectible.slotOf(anel)]).toBe(1);

    resetTrackToys();
    expect(Collectible.fields.collected[Collectible.slotOf(anel)]).toBe(0);
    cena.mundo.clear();
  });
});

describe('mola', () => {
  it('joga o personagem para cima', () => {
    const cena = montar();
    cena.por(Spring, 0, 0.5, 0);
    cena.passo(2);

    expect(SpeedCharacter.fields.vy[cena.cs]).toBeGreaterThan(20);
    expect(SpeedCharacter.fields.grounded[cena.cs]).toBe(0);

    // E ele sobe de verdade, e nao so ganha um numero.
    cena.passo(20);
    expect(Transform.fields.y[cena.ts]).toBeGreaterThan(5);
    cena.mundo.clear();
  });

  it('atira para o lado quando está deitada', () => {
    const cena = montar();
    const mola = cena.por(Spring, 0, 0.5, 0);
    // Deitada: o "para cima" dela aponta para +X.
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    const ms = Transform.slotOf(mola);
    Transform.fields.qx[ms] = giro.x;
    Transform.fields.qy[ms] = giro.y;
    Transform.fields.qz[ms] = giro.z;
    Transform.fields.qw[ms] = giro.w;

    cena.passo(2);
    expect(SpeedCharacter.fields.vx[cena.cs]).toBeGreaterThan(20);
    cena.mundo.clear();
  });

  it('não dispara duas vezes seguidas', () => {
    const cena = montar();
    const mola = cena.por(Spring, 0, 0.5, 0);
    cena.passo(2);
    const ss = Spring.slotOf(mola);
    expect(Spring.fields.cooldown[ss]).toBeGreaterThan(0);

    // Ainda em cima dela, no passo seguinte: a recarga segura o segundo tiro.
    const antes = SpeedCharacter.fields.vy[cena.cs];
    cena.passo(1);
    expect(SpeedCharacter.fields.vy[cena.cs]).toBeLessThan(antes);
    cena.mundo.clear();
  });
});

describe('meta', () => {
  it('encostar termina a fase', () => {
    const cena = montar();
    cena.por(Goal, 0, 1, 0);
    cena.passo(2);
    expect(cena.partida.estado).toBe('venceu');
    cena.mundo.clear();
  });

  it('meta longe não termina nada', () => {
    const cena = montar();
    cena.por(Goal, 30, 1, 0);
    cena.passo(5);
    expect(cena.partida.estado).toBe('jogando');
    cena.mundo.clear();
  });
});

describe('buraco', () => {
  it('cair custa uma vida e devolve ao ponto de partida', () => {
    const cena = montar();
    Transform.fields.y[cena.ts] = -40;
    cena.passo(1);

    expect(cena.partida.vidas).toBe(2);
    expect(Transform.fields.y[cena.ts]).toBeCloseTo(INICIO.y, 5);
    expect(Transform.fields.z[cena.ts]).toBeCloseTo(INICIO.z, 5);
    expect(SpeedCharacter.fields.vy[cena.cs]).toBe(0);
    cena.mundo.clear();
  });

  it('cair sem vidas termina a partida', () => {
    const cena = montar();
    cena.partida.vidas = 1;
    Transform.fields.y[cena.ts] = -40;
    cena.passo(1);
    expect(cena.partida.estado).toBe('perdeu');
    cena.mundo.clear();
  });
});
