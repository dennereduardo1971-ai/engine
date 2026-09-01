import * as THREE from 'three';
import { defineComponent, defineSystem, type System, Transform, view } from '@faisca/runtime';
import { groundSpeed, type Partida, SpeedCharacter } from '@faisca/kit-velocidade';

/**
 * O patrulheiro — o primeiro inimigo da engine (secao 10 do plano).
 *
 * Ele anda de um lado para o outro num trecho e nao pensa em nada. E de
 * proposito: o primeiro inimigo de um jogo tem que ser lido de longe e
 * derrotado sem susto, senao a fase deixa de ser uma pista e vira um campo
 * minado.
 *
 * A regra de encostar nele e a de sempre: **por cima ele morre, por baixo
 * voce se machuca**. Um jogo de plataforma inteiro cabe nessa frase, e ela
 * precisa valer sem excecao — inclusive rolando, que e o ataque do Sonic.
 */
/** Campos do patrulheiro, separados para o `as const` valer no esquema. */
const CAMPOS = {
  /** Velocidade da ronda, em unidades por segundo. */
  speed: 'f32',
  /** Quanto ele anda para cada lado do ponto onde foi colocado. */
  range: 'f32',
  /** Raio de contato. */
  radius: 'f32',
  /**
   * Altura do centro do corpo acima da base da peca.
   *
   * A peca fica apoiada pelo pe — essa e a regra do editor. Mas o contato tem
   * que ser medido no corpo, e nao no pe: sem isto, o personagem *de pe ao
   * lado* do inimigo ja estaria "acima" dele, e encostar de lado viraria
   * pisar em cima.
   */
  centerY: 'f32',
  /** Impulso que o personagem ganha ao pular em cima dele. */
  bounce: 'f32',
  /** Empurrao que ele da em quem encosta de lado. */
  knockback: 'f32',

  // Estado.
  /** Direcao da ronda, guardada no primeiro passo. */
  ax: 'f32',
  az: 'f32',
  ox: 'f32',
  oy: 'f32',
  oz: 'f32',
  /** Onde ele esta no trajeto, de -range a +range. */
  offset: 'f32',
  /** 1 indo, -1 voltando. */
  dir: 'f32',
  alive: 'u8',
  started: 'u8',
} as const;

export const Patroller = defineComponent('Patroller', 'Inimigo Patrulheiro', CAMPOS, {
  speed: 4,
  range: 6,
  radius: 0.9,
  centerY: 0.85,
  bounce: 13,
  knockback: 9,
  dir: 1,
  alive: 1,
});

/**
 * Acima disto, o personagem conta como estando "em cima" do inimigo.
 *
 * A conta e em fracao do raio, e nao em unidades: um inimigo maior precisa de
 * uma margem maior, senao encostar na testa dele viraria dano.
 */
const ALTURA_DE_PISAR = 0.45;
/** Rolando acima desta velocidade, o personagem quebra o inimigo de qualquer lado. */
const VELOCIDADE_DE_ATAQUE = 6;

export interface PatrollerOptions {
  partida: Partida;
}

export function patrollerSystem(options: PatrollerOptions): System {
  const { partida } = options;
  const inimigos = view(Transform, Patroller);
  const personagens = view(Transform, SpeedCharacter);

  const eixo = new THREE.Vector3();
  const giro = new THREE.Quaternion();
  const empurrao = new THREE.Vector3();

  return defineSystem({
    name: 'Patroller',
    phase: 'logic',
    order: 110,
    update({ dt }) {
      const t = Transform.fields;
      const p = Patroller.fields;

      inimigos.each((_inimigo, ts, ps) => {
        if (p.alive[ps] === 0) return;

        // O trajeto e guardado no primeiro passo: a partir daqui a entidade
        // se move, e ler a posicao dela de novo daria um passeio sem volta.
        if (p.started[ps] === 0) {
          giro.set(t.qx[ts], t.qy[ts], t.qz[ts], t.qw[ts]);
          eixo.set(0, 0, 1).applyQuaternion(giro);
          eixo.y = 0;
          if (eixo.lengthSq() < 1e-6) eixo.set(0, 0, 1);
          eixo.normalize();
          p.ax[ps] = eixo.x;
          p.az[ps] = eixo.z;
          p.ox[ps] = t.x[ts];
          p.oy[ps] = t.y[ts];
          p.oz[ps] = t.z[ts];
          p.started[ps] = 1;
        }

        let offset = p.offset[ps] + p.dir[ps] * p.speed[ps] * dt;
        const limite = p.range[ps];
        if (offset > limite) {
          offset = limite;
          p.dir[ps] = -1;
        } else if (offset < -limite) {
          offset = -limite;
          p.dir[ps] = 1;
        }
        p.offset[ps] = offset;

        t.x[ts] = p.ox[ps] + p.ax[ps] * offset;
        t.z[ts] = p.oz[ps] + p.az[ps] * offset;

        // Vira para onde esta indo.
        const rumo = Math.atan2(p.ax[ps] * p.dir[ps], p.az[ps] * p.dir[ps]);
        const meio = rumo * 0.5;
        t.qx[ts] = 0;
        t.qy[ts] = Math.sin(meio);
        t.qz[ts] = 0;
        t.qw[ts] = Math.cos(meio);
      });

      if (!partida.jogando) return;

      const c = SpeedCharacter.fields;
      personagens.each((_heroi, hs, cs) => {
        const hx = t.x[hs];
        const hy = t.y[hs];
        const hz = t.z[hs];
        const raioHeroi = c.radius[cs];

        inimigos.each((_inimigo, ts, ps) => {
          if (p.alive[ps] === 0) return;
          const alcance = p.radius[ps] + raioHeroi;
          const centro = t.y[ts] + p.centerY[ps];
          const dx = t.x[ts] - hx;
          const dy = centro - hy;
          const dz = t.z[ts] - hz;
          if (dx * dx + dy * dy + dz * dz > alcance * alcance) return;

          const porCima = hy > centro + p.radius[ps] * ALTURA_DE_PISAR && c.vy[cs] <= 0;
          const rolando = c.rolling[cs] === 1 && groundSpeed(cs) > VELOCIDADE_DE_ATAQUE;

          if (porCima || rolando) {
            p.alive[ps] = 0;
            // Escala zero tira ele da vista sem tirar do lote instanciado.
            t.sx[ts] = t.sy[ts] = t.sz[ts] = 0;
            if (porCima) {
              // O quique de quem pisa: e ele que faz pular de inimigo em
              // inimigo, e e por isso que pisar e divertido e nao so seguro.
              c.vy[cs] = p.bounce[ps];
              c.grounded[cs] = 0;
              c.noStick[cs] = 0.2;
            }
            return;
          }

          if (partida.invulneravel > 0) return;
          partida.levarDano();
          // Empurra para longe do inimigo, para nao levar dano duas vezes
          // seguidas no mesmo encostao.
          empurrao.set(-dx, 0, -dz);
          if (empurrao.lengthSq() < 1e-6) empurrao.set(0, 0, -1);
          empurrao.normalize().multiplyScalar(p.knockback[ps]);
          c.vx[cs] = empurrao.x;
          c.vz[cs] = empurrao.z;
          c.vy[cs] = p.bounce[ps] * 0.5;
          c.grounded[cs] = 0;
          c.noStick[cs] = 0.2;
        });
      });
    },
  });
}

/** Devolve os inimigos ao estado de antes da partida. */
export function resetPatrollers(): void {
  const p = Patroller.fields;
  for (let slot = 0; slot < Patroller.count; slot++) {
    p.alive[slot] = 1;
    p.started[slot] = 0;
    p.offset[slot] = 0;
    p.dir[slot] = 1;
  }
}
