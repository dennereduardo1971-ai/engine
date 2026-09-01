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
import { aproximarAngulo, groundSpeed, SpeedCharacter } from './character.ts';

/** Distancia minima do personagem, quando a parede empurra a camera. */
const MIN_DISTANCE = 1.6;
/** Folga entre a camera e a parede em que ela encostou. */
const CAMERA_SKIN = 0.3;

/**
 * Camera que segue — a do plano: acompanha sozinha, deixa o analogico direito
 * mexer, e abre o campo de visao quando o personagem acelera (secao 9).
 *
 * Ela roda na fase de render, e nao na de logica, por dois motivos: usa a
 * posicao ja interpolada do personagem (senao tremeria a 30 fps) e suaviza com
 * o tempo real do quadro, o que a faz se comportar igual em qualquer taxa.
 */
export const FollowCamera = defineComponent('FollowCamera', 'Câmera que Segue', {
  /** Entidade seguida. */
  target: 'u32',
  /** Distancia horizontal ate o personagem. */
  distance: 'f32',
  /** Altura da camera acima do chao do personagem. */
  height: 'f32',
  /** Altura do ponto para onde ela olha (o peito, nao os pes). */
  lookHeight: 'f32',
  /** Quao rapido a camera alcanca a posicao desejada. Maior = mais colada. */
  damping: 'f32',
  yaw: 'f32',
  pitch: 'f32',
  minPitch: 'f32',
  maxPitch: 'f32',
  /** Radianos por segundo com o analogico no fim do curso. */
  lookSensitivity: 'f32',
  /** Quao rapido ela volta sozinha para tras do personagem. */
  autoAlign: 'f32',
  /** Campo de visao parado e a toda. */
  fovBase: 'f32',
  fovWide: 'f32',
  /** Velocidade em que o campo de visao chega no maximo. */
  fovSpeed: 'f32',
  initialized: 'u8',
});

export function makeFollowCamera(entity: Entity, target: Entity): number {
  const slot = FollowCamera.add(entity);
  const f = FollowCamera.fields;
  f.target[slot] = target;
  f.distance[slot] = 9;
  f.height[slot] = 4.2;
  f.lookHeight[slot] = 1.6;
  f.damping[slot] = 7;
  f.yaw[slot] = 0;
  f.pitch[slot] = 0.16;
  f.minPitch[slot] = -0.35;
  f.maxPitch[slot] = 1.1;
  f.lookSensitivity[slot] = 2.6;
  f.autoAlign[slot] = 1.6;
  f.fovBase[slot] = 60;
  f.fovWide[slot] = 76;
  f.fovSpeed[slot] = 22;
  f.initialized[slot] = 0;
  return slot;
}

export interface FollowCameraOptions {
  camera: THREE.PerspectiveCamera;
  input: Input;
  /**
   * O mundo de colisao. Com ele, a camera para na parede em vez de atravessar.
   * Sem ele, a camera funciona igual — so nao enxerga o cenario.
   */
  physics?: PhysicsWorld | null;
}

/** Um sistema por camera: ele dirige a camera do Three.js que recebe. */
export function followCameraSystem(options: FollowCameraOptions): System {
  const { camera, input } = options;
  const physics = options.physics ?? null;
  const cameras = view(FollowCamera);

  const alvoPos = new THREE.Vector3();
  const desejada = new THREE.Vector3();
  const olhar = new THREE.Vector3();
  const paraCamera = new THREE.Vector3();

  return defineSystem({
    name: 'FollowCamera',
    phase: 'render',
    order: -900,
    update({ frameTime, alpha }) {
      const look = input.axis('look');
      const t = Transform.fields;
      const f = FollowCamera.fields;

      cameras.each((_entidade, cs) => {
        const alvo = f.target[cs] as Entity;
        const ts = Transform.slotOf(alvo);
        if (ts < 0) return;

        // Posicao interpolada do personagem, a mesma que sera desenhada.
        alvoPos.set(
          t.px[ts] + (t.x[ts] - t.px[ts]) * alpha,
          t.py[ts] + (t.y[ts] - t.py[ts]) * alpha,
          t.pz[ts] + (t.z[ts] - t.pz[ts]) * alpha,
        );

        // Liberdade parcial no analogico: enquanto o jogador mexe, ele manda.
        const mexendo = Math.abs(look.x) > 0.01 || Math.abs(look.y) > 0.01;
        if (mexendo) {
          f.yaw[cs] -= look.x * f.lookSensitivity[cs] * frameTime;
          f.pitch[cs] = clamp(
            f.pitch[cs] + look.y * f.lookSensitivity[cs] * 0.6 * frameTime,
            f.minPitch[cs],
            f.maxPitch[cs],
          );
        }

        const cs2 = SpeedCharacter.slotOf(alvo);
        const velocidade = cs2 >= 0 ? groundSpeed(cs2) : 0;

        // Sem mao no analogico e com o personagem correndo, ela volta sozinha
        // para tras dele — e o que faz a camera "seguir a pista".
        if (!mexendo && cs2 >= 0 && velocidade > 2) {
          const forca = Math.min(1, velocidade / 12);
          f.yaw[cs] = aproximarAngulo(
            f.yaw[cs],
            SpeedCharacter.fields.yaw[cs2],
            f.autoAlign[cs] * forca * frameTime,
          );
        }

        const cosP = Math.cos(f.pitch[cs]);
        const sinP = Math.sin(f.pitch[cs]);
        const distancia = f.distance[cs];
        desejada.set(
          alvoPos.x - Math.sin(f.yaw[cs]) * distancia * cosP,
          alvoPos.y + f.height[cs] + sinP * distancia,
          alvoPos.z - Math.cos(f.yaw[cs]) * distancia * cosP,
        );

        // --- A camera nao atravessa parede ---------------------------------
        //
        // Sem isto, o loop do M2 vira uma tela azul: o personagem corre por
        // dentro do aro, e a camera, nove unidades atras dele, fica dentro da
        // parede do aro. Um raio do olho do personagem ate onde a camera quer
        // ficar resolve — se tem cenario no caminho, ela para antes dele.
        olhar.set(alvoPos.x, alvoPos.y + f.lookHeight[cs], alvoPos.z);
        let colidiu = false;
        if (physics) {
          paraCamera.copy(desejada).sub(olhar);
          const distancia = paraCamera.length();
          if (distancia > 1e-4) {
            paraCamera.divideScalar(distancia);
            const batida = physics.castRay(olhar, paraCamera, distancia);
            if (batida) {
              // Uma folga para a camera nao encostar o nariz na parede e
              // enxergar por dentro dela.
              const livre = Math.max(MIN_DISTANCE, batida.distance - CAMERA_SKIN);
              desejada.copy(olhar).addScaledVector(paraCamera, livre);
              colidiu = true;
            }
          }
        }

        if (f.initialized[cs] === 0) {
          camera.position.copy(desejada);
          f.initialized[cs] = 1;
        } else if (
          colidiu &&
          camera.position.distanceToSquared(olhar) > desejada.distanceToSquared(olhar)
        ) {
          // Entrar na frente da parede e imediato: suavizar isso deixaria a
          // camera dentro do cenario justamente durante o quadro em que o
          // jogador precisa enxergar. Sair de perto, ao contrario, e suave —
          // e o caminho de volta cai no ramo de baixo.
          camera.position.copy(desejada);
        } else {
          // Suavizacao exponencial: independente da taxa de quadros, ao
          // contrario de um lerp com fator fixo, que gruda a 144 fps e arrasta
          // a 30.
          camera.position.lerp(desejada, 1 - Math.exp(-f.damping[cs] * frameTime));
        }

        camera.lookAt(olhar);

        // Abre o campo de visao com a velocidade: a sensacao de rapido vem
        // mais daqui do que do numero da velocidade.
        const alvoFov =
          f.fovBase[cs] +
          (f.fovWide[cs] - f.fovBase[cs]) * Math.min(1, velocidade / f.fovSpeed[cs]);
        const novoFov = camera.fov + (alvoFov - camera.fov) * (1 - Math.exp(-4 * frameTime));
        if (Math.abs(novoFov - camera.fov) > 0.01) {
          camera.fov = novoFov;
          camera.updateProjectionMatrix();
        }
      });
    },
  });
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
