import * as THREE from 'three';
import {
  defineComponent,
  defineSystem,
  type Entity,
  type Input,
  type PhysicsWorld,
  type System,
  Transform,
  view,
} from '@faisca/runtime';

/**
 * Personagem Veloz — o controlador do Kit Velocidade.
 *
 * Este e o sistema mais caro e mais importante da engine (secao 9 do plano), e
 * este arquivo e a M2: o modelo de movimento inteiro passou a acontecer *ao
 * longo da superficie*, e nao no plano do mundo.
 *
 * A ideia toda cabe em quatro frases:
 *
 * 1. O personagem tem um **"para cima" proprio**, que se alinha a normal do
 *    chao. E isso, e so isso, que faz loop, parede e corkscrew funcionarem —
 *    correr no teto e correr no chao viram o mesmo codigo.
 * 2. A velocidade vive no **plano tangente** desse "para cima". Acelerar,
 *    frear e derrapar acontecem ali.
 * 3. A gravidade, no chao, entra como **inclinacao**: ela empurra ao longo da
 *    superficie. E por isso que descer ganha velocidade e subir perde, sem
 *    nenhum codigo especial para rampa.
 * 4. Ela so **puxa para fora** da superficie quando a velocidade cai abaixo do
 *    limite de aderencia numa superficie ingreme. E o instante exato em que
 *    Sonic despenca do loop se estiver devagar.
 *
 * O personagem nao tem corpo rigido no Rapier. Ele consulta o mundo (um raio
 * para achar o chao, uma bola empurrada para nao atravessar parede) e move a
 * si mesmo. Um solver de fisica generico faria dele uma bola de boliche, e nao
 * um Sonic.
 */
export const SpeedCharacter = defineComponent('SpeedCharacter', 'Personagem Veloz', {
  // Velocidade, em unidades por segundo, no mundo.
  vx: 'f32',
  vy: 'f32',
  vz: 'f32',

  // O "para cima" proprio: a normal da superficie em que ele esta.
  ux: 'f32',
  uy: 'f32',
  uz: 'f32',

  // Para onde ele esta virado, no plano tangente.
  fx: 'f32',
  fy: 'f32',
  fz: 'f32',

  // Deslizadores do inspetor.
  /** Quanto ganha de velocidade por segundo, com o analogico no fim do curso. */
  accel: 'f32',
  /**
   * Quanto perde por segundo quando ninguem esta acelerando.
   *
   * Ele e de proposito menor que `slopeAccel`. Se fosse maior, o personagem
   * parado numa ladeira ficaria parado nela — e "descer ganha velocidade" e
   * metade do que faz um Sonic ser um Sonic. A relacao entre os dois e o que
   * decide a partir de que inclinacao ele escorrega sozinho: com 4,5 e 12, e
   * a partir de uns 22 graus.
   */
  friction: 'f32',
  /** Freio de quem inverte a direcao correndo: a derrapagem. */
  skidDecel: 'f32',
  /** Teto de velocidade que o analogico alcanca. Ladeira e mola passam disso. */
  maxSpeed: 'f32',
  /** Controle no ar, sempre menor que no chao. */
  airAccel: 'f32',
  /** Quao rapido o personagem vira para onde esta indo, em radianos por segundo. */
  turnRate: 'f32',
  /** Impulso do pulo, ao longo do "para cima" dele. */
  jumpSpeed: 'f32',
  /** Velocidade que sobra ao soltar o botao cedo: e o pulo curto. */
  jumpCut: 'f32',
  /** Gravidade no ar. */
  gravity: 'f32',
  /**
   * Gravidade ao longo da superficie, no chao.
   *
   * Ela e bem menor que a do ar de proposito, e nao por descuido: a do ar e
   * escolhida para o pulo ser curto e responsivo, e usar esse mesmo numero na
   * ladeira faria o loop ser matematicamente impossivel na velocidade maxima.
   * Todo Sonic separa os dois.
   */
  slopeAccel: 'f32',
  /** Multiplicador da inclinacao subindo, rolando. */
  rollUpSlope: 'f32',
  /** Multiplicador da inclinacao descendo, rolando: e o que ganha velocidade. */
  rollDownSlope: 'f32',
  /** Atrito enquanto rola — bem menor que o de pe. */
  rollFriction: 'f32',
  /** Abaixo disso, superficie ingreme deixa de segurar. */
  adhesion: 'f32',
  /** Raio da bola que colide com o cenario. */
  radius: 'f32',

  // Estado.
  grounded: 'u8',
  rolling: 'u8',
  /** Sobra de tempo para pular depois de sair da beirada. */
  coyote: 'f32',
  /** Pulo apertado um pouquinho antes de encostar no chao. */
  jumpBuffer: 'f32',
  /** Tempo em que ele nao gruda de volta (acabou de pular ou de soltar). */
  noStick: 'f32',
  /** Guinada no plano do mundo, em radianos. E o que a camera segue. */
  yaw: 'f32',
});

/** Valores de fabrica: um bonequinho rapido, mas ainda obediente. */
export function speedCharacterDefaults(slot: number): void {
  const f = SpeedCharacter.fields;
  f.accel[slot] = 55;
  f.friction[slot] = 4.5;
  f.skidDecel[slot] = 95;
  f.maxSpeed[slot] = 24;
  f.airAccel[slot] = 22;
  f.turnRate[slot] = 11;
  f.jumpSpeed[slot] = 15;
  f.jumpCut[slot] = 8;
  f.gravity[slot] = 46;
  f.slopeAccel[slot] = 12;
  f.rollUpSlope[slot] = 0.55;
  f.rollDownSlope[slot] = 2.2;
  f.rollFriction[slot] = 1.5;
  f.adhesion[slot] = 12;
  f.radius[slot] = 0.6;
  f.grounded[slot] = 1;
  f.rolling[slot] = 0;
  f.coyote[slot] = 0;
  f.jumpBuffer[slot] = 0;
  f.noStick[slot] = 0;
  f.yaw[slot] = 0;
  f.vx[slot] = f.vy[slot] = f.vz[slot] = 0;
  f.ux[slot] = 0;
  f.uy[slot] = 1;
  f.uz[slot] = 0;
  f.fx[slot] = 0;
  f.fy[slot] = 0;
  f.fz[slot] = 1;
}

/** Coloca o componente numa entidade, ja com os valores de fabrica. */
export function makeSpeedCharacter(entity: Entity): number {
  const slot = SpeedCharacter.add(entity);
  speedCharacterDefaults(slot);
  return slot;
}

/**
 * Velocidade ao longo da superficie — a que importa para a HUD, para a camera
 * e para os efeitos de velocidade. Cair de um precipicio nao e "correr rapido".
 */
export function groundSpeed(slot: number): number {
  const f = SpeedCharacter.fields;
  const ux = f.ux[slot];
  const uy = f.uy[slot];
  const uz = f.uz[slot];
  const vx = f.vx[slot];
  const vy = f.vy[slot];
  const vz = f.vz[slot];
  const ao = vx * ux + vy * uy + vz * uz;
  return Math.hypot(vx - ux * ao, vy - uy * ao, vz - uz * ao);
}

const COYOTE_TIME = 0.1;
const JUMP_BUFFER_TIME = 0.12;
/** Folga entre a bola e a superficie: evita consulta que comeca encostada. */
const SKIN = 0.02;
/** Quanto abaixo dos pes a superficie ainda segura, correndo. */
const SNAP = 0.5;
/** Quanto abaixo dos pes conta como pouso, vindo do ar. */
const LANDING = 0.12;
/** Quantas vezes o passo pode bater e deslizar antes de desistir. */
const SLIDES = 4;
/** Acima disto, e parede: devagar ali, ele solta. */
const STEEP = 0.5;
/** Velocidade minima para rolar valer alguma coisa. */
const MIN_ROLL = 3;
/** Acima disto, a superficie em que ele esbarrou conta como chao novo. */
const WALKABLE = 0.3;

export interface SpeedCharacterOptions {
  /**
   * A camera que define para onde e "para frente". Empurrar o analogico para
   * cima tem que levar o personagem para o fundo da tela, seja qual for o lado
   * para onde a camera esta olhando — sem isso, virar a camera inverte os
   * controles no meio da corrida.
   */
  camera: THREE.Camera;
  input: Input;
  /** O mundo de colisao. E dele que sai o chao, a rampa e o loop. */
  physics: PhysicsWorld;
}

/**
 * Le o analogico, resolve o contato com o cenario e move o personagem.
 *
 * Roda na fase de fisica, depois do passo do Rapier: as consultas precisam da
 * arvore de colisao ja atualizada.
 */
export function speedCharacterSystem(options: SpeedCharacterOptions): System {
  const { camera, input, physics } = options;
  const personagens = view(Transform, SpeedCharacter);

  // Tudo pre-alocado: este sistema roda 60 vezes por segundo e nao pode dar
  // trabalho ao coletor de lixo, que aparece como engasgo na tela.
  const up = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const slope = new THREE.Vector3();
  const step = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const right = new THREE.Vector3();
  const apoioNormal = new THREE.Vector3();
  const alvo = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const base = new THREE.Matrix4();
  const giro = new THREE.Quaternion();

  return defineSystem({
    name: 'SpeedCharacter',
    phase: 'physics',
    order: -20,
    update({ dt }) {
      const stick = input.axis('move');
      const pulou = input.justPressed('jump');
      const soltou = input.justReleased('jump');
      const rolando = input.isDown('roll');

      camera.getWorldDirection(camForward);
      const t = Transform.fields;
      const c = SpeedCharacter.fields;

      personagens.each((_entidade, ts, cs) => {
        up.set(c.ux[cs], c.uy[cs], c.uz[cs]);
        if (up.lengthSq() < 1e-6) up.copy(worldUp);
        up.normalize();
        pos.set(t.x[ts], t.y[ts], t.z[ts]);
        vel.set(c.vx[cs], c.vy[cs], c.vz[cs]);
        facing.set(c.fx[cs], c.fy[cs], c.fz[cs]);
        const raio = c.radius[cs];

        // --- Tempos -------------------------------------------------------
        if (pulou) c.jumpBuffer[cs] = JUMP_BUFFER_TIME;
        c.jumpBuffer[cs] = Math.max(0, c.jumpBuffer[cs] - dt);
        c.noStick[cs] = Math.max(0, c.noStick[cs] - dt);
        let noChao = c.grounded[cs] === 1;
        c.coyote[cs] = noChao ? COYOTE_TIME : Math.max(0, c.coyote[cs] - dt);

        // --- Onde fica o "para frente" do analogico ------------------------
        //
        // No chao, e a camera que manda: empurrar para cima leva o personagem
        // para o fundo da tela, seja qual for o lado para onde a camera olha.
        //
        // Na parede de um loop, isso deixa de fazer sentido — e ate vira o
        // contrario. Deitada no plano de uma parede, a direcao para onde a
        // camera olha aponta *para baixo*, e segurar o analogico para frente
        // seria pedir para descer: o personagem freiaria no meio do loop,
        // achando que o jogador quer voltar. Por isso, quanto mais em pe a
        // superficie, mais o "para frente" passa a ser o do proprio
        // personagem — que e o que "segura para frente e faz o loop"
        // significa em qualquer Sonic 3D.
        const apoio = Math.max(0, Math.min(1, up.dot(worldUp)));

        camRight.copy(camForward).addScaledVector(up, -camForward.dot(up));
        if (camRight.lengthSq() < 1e-8) camRight.copy(facing);
        camRight.normalize();

        desired.copy(facing).addScaledVector(up, -facing.dot(up));
        if (desired.lengthSq() < 1e-8) desired.copy(camRight);
        desired.normalize();

        // `desired` vira o eixo para frente: o do personagem, puxado para o da
        // camera na medida em que o chao e mesmo chao.
        desired.lerp(camRight, apoio);
        desired.addScaledVector(up, -desired.dot(up));
        if (desired.lengthSq() < 1e-8) desired.copy(camRight);
        desired.normalize();

        camRight.copy(desired).cross(up).normalize();
        // O eixo Y do analogico e positivo para baixo; para frente e -y.
        desired.multiplyScalar(-stick.y).addScaledVector(camRight, stick.x);
        const intensidade = Math.min(1, desired.length());
        if (intensidade > 0.0001) desired.normalize();
        else desired.set(0, 0, 0);

        // --- Velocidade no plano tangente ---------------------------------
        tangent.copy(vel).addScaledVector(up, -vel.dot(up));
        const velocidade = tangent.length();

        if (noChao) {
          // Rolar so vale correndo: agachar parado nao e rolar.
          c.rolling[cs] = rolando && velocidade > MIN_ROLL ? 1 : 0;
          const rola = c.rolling[cs] === 1;

          if (rola) {
            // Rolando nao se acelera: so o atrito baixo e a ladeira.
            aplicarAtrito(tangent, c.rollFriction[cs] * dt);
          } else if (intensidade > 0) {
            const alinhamento = velocidade > 0.001 ? desired.dot(tangent) / velocidade : 1;
            if (alinhamento < -0.25 && velocidade > 1) {
              // Derrapagem: inverter a direcao correndo nao vira uma curva
              // instantanea, vira um freio. E o que da peso ao personagem.
              aplicarAtrito(tangent, c.skidDecel[cs] * dt);
            } else if (velocidade < c.maxSpeed[cs]) {
              // O teto e do analogico, e nao da fisica: ladeira, mola e
              // acelerador passam dele, e e disso que momentum e feito.
              //
              // E o empurrao vale menos quanto mais em pe estiver a superficie:
              // no chao ele e inteiro, na parede de um loop e zero. Sem isso,
              // segurar o analogico subiria qualquer parede do mundo, e o loop
              // deixaria de ser uma questao de embalo — que e justamente o que
              // a secao 9 do plano promete que ele seja.
              tangent.addScaledVector(desired, c.accel[cs] * intensidade * apoio * dt);
              const nova = tangent.length();
              if (nova > c.maxSpeed[cs]) tangent.multiplyScalar(c.maxSpeed[cs] / nova);
            }
          } else {
            aplicarAtrito(tangent, c.friction[cs] * dt);
          }

          // Gravidade como inclinacao: a componente da gravidade que anda ao
          // longo da superficie. Em chao plano ela e exatamente zero.
          slope.copy(down).addScaledVector(up, -down.dot(up));
          if (slope.lengthSq() > 1e-8) {
            let forca = c.slopeAccel[cs];
            if (rola) {
              const descendo = tangent.dot(slope) > 0;
              forca *= descendo ? c.rollDownSlope[cs] : c.rollUpSlope[cs];
            }
            tangent.addScaledVector(slope, forca * dt);
          }

          vel.copy(tangent);
        } else {
          // No ar: controle menor, e a gravidade do mundo, para baixo.
          if (intensidade > 0) {
            vel.addScaledVector(desired, c.airAccel[cs] * intensidade * dt);
            const plano = Math.hypot(vel.x, vel.z);
            const teto = Math.max(c.maxSpeed[cs], velocidade);
            if (plano > teto) {
              const escala = teto / plano;
              vel.x *= escala;
              vel.z *= escala;
            }
          }
          vel.y -= c.gravity[cs] * dt;
        }

        // --- Pulo ----------------------------------------------------------
        // Primeiro o corte do pulo que ja estava no ar, so depois o pulo novo.
        // Se a ordem fosse outra, um pulo guardado que sai no mesmo passo em
        // que o jogador solta o botao nasceria ja cortado.
        if (soltou) {
          const subindo = vel.dot(up);
          if (subindo > c.jumpCut[cs]) vel.addScaledVector(up, c.jumpCut[cs] - subindo);
        }
        if (c.jumpBuffer[cs] > 0 && c.coyote[cs] > 0) {
          // Pula ao longo do "para cima" dele: dentro do loop, isso joga para
          // o meio do loop, e nao para o ceu.
          vel.addScaledVector(up, c.jumpSpeed[cs]);
          c.jumpBuffer[cs] = 0;
          c.coyote[cs] = 0;
          c.noStick[cs] = 0.12;
          c.rolling[cs] = 0;
          noChao = false;
        }

        // --- Andar, batendo e deslizando ----------------------------------
        // A superficie em que ele esbarrou e que da para pisar. Ela e o que
        // resolve o pe da rampa e a entrada do loop: ali o chao velho ainda
        // esta logo abaixo, e um raio para baixo continuaria escolhendo ele —
        // o personagem subiria um dedo e seria puxado de volta, quadro a
        // quadro, sem nunca entrar na rampa.
        let temApoio = false;
        apoioNormal.set(0, 0, 0);

        step.copy(vel).multiplyScalar(dt);
        for (let i = 0; i < SLIDES; i++) {
          const distancia = step.length();
          if (distancia < 1e-6) break;
          dir.copy(step).divideScalar(distancia);
          const batida = physics.castBall(raio, pos, dir, distancia + SKIN);
          if (!batida) {
            pos.add(step);
            break;
          }
          const avanco = Math.max(0, batida.distance - SKIN);
          pos.addScaledVector(dir, avanco);
          normal.set(batida.normal.x, batida.normal.y, batida.normal.z);
          if (normal.lengthSq() < 1e-8) break;
          normal.normalize();
          if (normal.dot(worldUp) > WALKABLE) {
            apoioNormal.copy(normal);
            temApoio = true;
          }
          // O que sobrou do passo, sem a parte que entra na parede.
          step.addScaledVector(dir, -avanco);
          step.addScaledVector(normal, -step.dot(normal));
          vel.addScaledVector(normal, -Math.min(0, vel.dot(normal)));
        }

        // --- Achar o chao e grudar nele -----------------------------------
        let grudou = false;
        if (c.noStick[cs] <= 0) {
          if (temApoio) {
            // Encostou numa superficie pisavel neste passo: e nela que ele
            // esta, e nao no que estiver embaixo dela.
            grudou = true;
            up.copy(apoioNormal);
            pos.addScaledVector(up, SKIN);
            vel.addScaledVector(up, -Math.min(0, vel.dot(up)));
          } else {
            const alcance = raio + (noChao ? SNAP : LANDING);
            const chao = physics.castRay(pos, { x: -up.x, y: -up.y, z: -up.z }, alcance);
            if (chao) {
              normal.set(chao.normal.x, chao.normal.y, chao.normal.z);
              if (normal.lengthSq() > 1e-8) {
                normal.normalize();
                // Vindo do ar, so pousa indo na direcao da superficie.
                if (noChao || vel.dot(normal) <= 0.001) {
                  grudou = true;
                  up.copy(normal);
                  pos.set(
                    chao.point.x + up.x * (raio + SKIN),
                    chao.point.y + up.y * (raio + SKIN),
                    chao.point.z + up.z * (raio + SKIN),
                  );
                  vel.addScaledVector(up, -vel.dot(up));
                }
              }
            }
          }
        }

        if (grudou) {
          // Aderencia: numa superficie ingreme, devagar, ele solta. E o
          // instante em que Sonic despenca do loop.
          const inclinacao = up.dot(worldUp);
          const rapidez = vel.length();
          if (inclinacao < STEEP && rapidez < c.adhesion[cs]) {
            grudou = false;
            c.noStick[cs] = 0.2;
          }
        }

        c.grounded[cs] = grudou ? 1 : 0;
        if (!grudou) {
          c.rolling[cs] = 0;
          // Fora do chao, o "para cima" volta para o do mundo — senao o
          // personagem cairia de lado depois de soltar de uma parede.
          up.lerp(worldUp, 1 - Math.exp(-9 * dt));
          if (up.lengthSq() < 1e-6) up.copy(worldUp);
          up.normalize();
        }

        // --- Para onde ele olha -------------------------------------------
        tangent.copy(vel).addScaledVector(up, -vel.dot(up));
        alvo.copy(tangent);
        if (alvo.length() > 0.6) {
          alvo.normalize();
        } else if (intensidade > 0) {
          alvo.copy(desired);
        } else {
          alvo.copy(facing);
        }
        alvo.addScaledVector(up, -alvo.dot(up));
        if (alvo.lengthSq() < 1e-8) alvo.copy(facing);
        else alvo.normalize();

        facing.addScaledVector(up, -facing.dot(up));
        if (facing.lengthSq() < 1e-8) facing.copy(alvo);
        else facing.normalize();

        // Giro em torno do proprio "para cima", com angulo com sinal.
        //
        // Interpolar os dois vetores em linha reta seria mais curto de
        // escrever e teria um buraco exatamente no pior lugar: com o alvo
        // *oposto* ao que ele olha — dar meia-volta —, a reta entre os dois
        // passa pela origem, e o personagem encolheria de volta para a mesma
        // direcao, para sempre, sem nunca virar.
        const cosseno = Math.min(1, Math.max(-1, facing.dot(alvo)));
        right.crossVectors(facing, alvo);
        const angulo = Math.atan2(up.dot(right), cosseno);
        const passo = c.turnRate[cs] * dt;
        if (Math.abs(angulo) <= passo) facing.copy(alvo);
        else facing.applyAxisAngle(up, Math.sign(angulo) * passo);

        // --- Escrever de volta --------------------------------------------
        c.vx[cs] = vel.x;
        c.vy[cs] = vel.y;
        c.vz[cs] = vel.z;
        c.ux[cs] = up.x;
        c.uy[cs] = up.y;
        c.uz[cs] = up.z;
        c.fx[cs] = facing.x;
        c.fy[cs] = facing.y;
        c.fz[cs] = facing.z;
        c.yaw[cs] = Math.atan2(facing.x, facing.z);
        t.x[ts] = pos.x;
        t.y[ts] = pos.y;
        t.z[ts] = pos.z;

        // A orientacao sai do par (para cima, para frente): correr no teto e
        // correr no chao produzem o mesmo codigo, e a malha acompanha.
        right.copy(up).cross(facing).normalize();
        base.makeBasis(right, up, facing);
        giro.setFromRotationMatrix(base);
        t.qx[ts] = giro.x;
        t.qy[ts] = giro.y;
        t.qz[ts] = giro.z;
        t.qw[ts] = giro.w;
      });
    },
  });
}

/** Tira `quanto` do comprimento do vetor, sem passar de zero nem virar o sinal. */
function aplicarAtrito(v: THREE.Vector3, quanto: number): void {
  const comprimento = v.length();
  if (comprimento <= 1e-6) return;
  const restante = Math.max(0, comprimento - quanto);
  v.multiplyScalar(restante / comprimento);
}

/** Gira `de` na direcao de `para` no maximo `passo` radianos, pelo lado curto. */
export function aproximarAngulo(de: number, para: number, passo: number): number {
  let diferenca = (para - de) % (Math.PI * 2);
  if (diferenca > Math.PI) diferenca -= Math.PI * 2;
  if (diferenca < -Math.PI) diferenca += Math.PI * 2;
  if (Math.abs(diferenca) <= passo) return para;
  return de + Math.sign(diferenca) * passo;
}
