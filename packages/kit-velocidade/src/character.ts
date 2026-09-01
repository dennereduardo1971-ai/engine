import * as THREE from 'three';
import {
  defineComponent,
  defineSystem,
  type Entity,
  type Input,
  type System,
  Transform,
  view,
} from '@faisca/runtime';

/**
 * Personagem Veloz — o controlador do Kit Velocidade.
 *
 * Este e o sistema mais caro e mais importante da engine (secao 9 do plano), e
 * ele nasce aqui na versao mais simples possivel: chao plano, sem fisica de
 * verdade. O M2 troca a integracao e o contato com o chao pelo Rapier e traz
 * rampa, loop e superficie grudenta. O que ja fica de pe agora, e nao muda
 * depois, e o modelo de movimento: aceleracao, atrito, atrito de derrapagem e
 * velocidade maxima como numeros regulaveis — os deslizadores do inspetor.
 *
 * Todos os campos estao em unidades por segundo (ou por segundo ao quadrado,
 * para aceleracao). Uma unidade e mais ou menos um metro.
 */
export const SpeedCharacter = defineComponent('SpeedCharacter', 'Personagem Veloz', {
  // Velocidade atual.
  vx: 'f32',
  vy: 'f32',
  vz: 'f32',

  // Deslizadores do inspetor.
  /** Quanto ganha de velocidade por segundo, com o analogico no fim do curso. */
  accel: 'f32',
  /** Quanto perde por segundo quando ninguem esta acelerando. */
  friction: 'f32',
  /** Freio de quem inverte a direcao correndo: a derrapagem. */
  skidDecel: 'f32',
  /** Teto de velocidade no chao. */
  maxSpeed: 'f32',
  /** Controle no ar, sempre menor que no chao. */
  airAccel: 'f32',
  /** Quao rapido o personagem vira para onde esta indo, em radianos por segundo. */
  turnRate: 'f32',
  /** Impulso do pulo. */
  jumpSpeed: 'f32',
  /** Velocidade que sobra ao soltar o botao cedo: e o pulo curto. */
  jumpCut: 'f32',
  gravity: 'f32',
  /** Altura do chao. Some no M2, quando o Rapier responder isso. */
  groundY: 'f32',

  // Estado.
  grounded: 'u8',
  /** Sobra de tempo para pular depois de sair da beirada. */
  coyote: 'f32',
  /** Pulo apertado um pouquinho antes de encostar no chao. */
  jumpBuffer: 'f32',
  /** Para onde o personagem esta virado, em radianos. */
  yaw: 'f32',
});

/** Valores de fabrica: um bonequinho rapido, mas ainda obediente. */
export function speedCharacterDefaults(slot: number): void {
  const f = SpeedCharacter.fields;
  f.accel[slot] = 55;
  f.friction[slot] = 28;
  f.skidDecel[slot] = 95;
  f.maxSpeed[slot] = 24;
  f.airAccel[slot] = 22;
  f.turnRate[slot] = 11;
  f.jumpSpeed[slot] = 15;
  f.jumpCut[slot] = 8;
  f.gravity[slot] = 46;
  f.groundY[slot] = 0;
  f.grounded[slot] = 1;
  f.coyote[slot] = 0;
  f.jumpBuffer[slot] = 0;
  f.yaw[slot] = 0;
  f.vx[slot] = f.vy[slot] = f.vz[slot] = 0;
}

/** Coloca o componente numa entidade, ja com os valores de fabrica. */
export function makeSpeedCharacter(entity: Entity): number {
  const slot = SpeedCharacter.add(entity);
  speedCharacterDefaults(slot);
  return slot;
}

/** Velocidade no plano do chao, para HUD, camera e efeitos de velocidade. */
export function groundSpeed(slot: number): number {
  const f = SpeedCharacter.fields;
  return Math.hypot(f.vx[slot], f.vz[slot]);
}

const COYOTE_TIME = 0.1;
const JUMP_BUFFER_TIME = 0.12;

export interface SpeedCharacterOptions {
  /**
   * A camera que define para onde e "para frente". Empurrar o analogico para
   * cima tem que levar o personagem para o fundo da tela, seja qual for o lado
   * para onde a camera esta olhando — sem isso, virar a camera inverte os
   * controles no meio da corrida.
   */
  camera: THREE.Camera;
  input: Input;
}

/**
 * Le o analogico, transforma em velocidade e move o personagem.
 *
 * Roda em passo fixo, antes de tudo. Como a integracao acontece aqui dentro, o
 * personagem nao usa o componente Velocidade generico: no M2 quem integra e o
 * Rapier, e a troca fica contida neste arquivo.
 */
export function speedCharacterSystem(options: SpeedCharacterOptions): System {
  const { camera, input } = options;
  const personagens = view(Transform, SpeedCharacter);

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return defineSystem({
    name: 'SpeedCharacter',
    phase: 'logic',
    order: -20,
    update({ dt }) {
      const stick = input.axis('move');
      const pulou = input.justPressed('jump');
      const soltou = input.justReleased('jump');

      // "Para frente" e para onde a camera olha, achatado no chao.
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      right.copy(forward).cross(up).normalize();

      // O eixo Y do analogico e positivo para baixo; para frente e -y.
      desired.set(0, 0, 0).addScaledVector(right, stick.x).addScaledVector(forward, -stick.y);
      const intensidade = Math.min(1, desired.length());
      if (intensidade > 0) desired.normalize();

      const t = Transform.fields;
      const c = SpeedCharacter.fields;

      personagens.each((_entidade, ts, cs) => {
        const noChao = c.grounded[cs] === 1;

        if (pulou) c.jumpBuffer[cs] = JUMP_BUFFER_TIME;
        c.jumpBuffer[cs] = Math.max(0, c.jumpBuffer[cs] - dt);
        c.coyote[cs] = noChao ? COYOTE_TIME : Math.max(0, c.coyote[cs] - dt);

        let vx = c.vx[cs];
        let vz = c.vz[cs];
        const velocidade = Math.hypot(vx, vz);
        const aceleracao = noChao ? c.accel[cs] : c.airAccel[cs];

        if (intensidade > 0) {
          const alinhamento =
            velocidade > 0.001 ? (desired.x * vx + desired.z * vz) / velocidade : 1;

          if (noChao && alinhamento < -0.25 && velocidade > 1) {
            // Derrapagem: inverter a direcao correndo nao vira uma curva
            // instantanea, vira um freio. E o que da peso ao personagem.
            const freio = Math.min(velocidade, c.skidDecel[cs] * dt);
            vx -= (vx / velocidade) * freio;
            vz -= (vz / velocidade) * freio;
          } else {
            vx += desired.x * aceleracao * intensidade * dt;
            vz += desired.z * aceleracao * intensidade * dt;
          }
        } else if (noChao) {
          const atrito = Math.min(velocidade, c.friction[cs] * dt);
          if (velocidade > 0.0001) {
            vx -= (vx / velocidade) * atrito;
            vz -= (vz / velocidade) * atrito;
          }
        }

        // Teto de velocidade: corta o excesso mantendo a direcao.
        const nova = Math.hypot(vx, vz);
        const teto = c.maxSpeed[cs];
        if (nova > teto) {
          const escala = teto / nova;
          vx *= escala;
          vz *= escala;
        }

        let vy = c.vy[cs];

        // Primeiro o pulo que ja estava no ar: soltar o botao no meio da
        // subida corta a sobra e faz um pulo curto.
        //
        // A ordem importa. Se o corte viesse depois, um pulo guardado que sai
        // no mesmo passo em que o jogador solta o botao nasceria ja cortado —
        // ele levaria um pulinho no lugar do pulo que pediu, sem ter tido
        // chance nenhuma de segurar.
        if (soltou && vy > c.jumpCut[cs]) vy = c.jumpCut[cs];

        // So entao o pulo novo: vale o coyote (saiu da beirada faz pouco) e
        // vale o buffer (apertou pouco antes de encostar). As duas folgas
        // somem da vista do jogador e aparecem como "o controle responde".
        if (c.jumpBuffer[cs] > 0 && c.coyote[cs] > 0) {
          vy = c.jumpSpeed[cs];
          c.jumpBuffer[cs] = 0;
          c.coyote[cs] = 0;
          c.grounded[cs] = 0;
        }

        vy -= c.gravity[cs] * dt;

        // Integra e resolve o chao. No M2 estas quatro linhas viram Rapier.
        let x = t.x[ts] + vx * dt;
        let y = t.y[ts] + vy * dt;
        let z = t.z[ts] + vz * dt;
        const chao = c.groundY[cs];
        if (y <= chao) {
          y = chao;
          if (vy < 0) vy = 0;
          c.grounded[cs] = 1;
        } else {
          c.grounded[cs] = 0;
        }

        // Vira para onde esta indo. Parado, vira para onde o analogico aponta.
        const alvo =
          Math.hypot(vx, vz) > 0.6
            ? Math.atan2(vx, vz)
            : intensidade > 0
              ? Math.atan2(desired.x, desired.z)
              : c.yaw[cs];
        c.yaw[cs] = aproximarAngulo(c.yaw[cs], alvo, c.turnRate[cs] * dt);

        c.vx[cs] = vx;
        c.vy[cs] = vy;
        c.vz[cs] = vz;
        t.x[ts] = x;
        t.y[ts] = y;
        t.z[ts] = z;

        // Guinada em torno de Y, escrita direto como quaternion.
        const meio = c.yaw[cs] * 0.5;
        t.qx[ts] = 0;
        t.qy[ts] = Math.sin(meio);
        t.qz[ts] = 0;
        t.qw[ts] = Math.cos(meio);
      });
    },
  });
}

/** Gira `de` na direcao de `para` no maximo `passo` radianos, pelo lado curto. */
export function aproximarAngulo(de: number, para: number, passo: number): number {
  let diferenca = (para - de) % (Math.PI * 2);
  if (diferenca > Math.PI) diferenca -= Math.PI * 2;
  if (diferenca < -Math.PI) diferenca += Math.PI * 2;
  if (Math.abs(diferenca) <= passo) return para;
  return de + Math.sign(diferenca) * passo;
}
