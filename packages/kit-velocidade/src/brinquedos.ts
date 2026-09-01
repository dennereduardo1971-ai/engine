import * as THREE from 'three';
import {
  defineComponent,
  defineSystem,
  type Entity,
  type System,
  Transform,
  view,
} from '@faisca/runtime';
import { SpeedCharacter } from './character.ts';
import { type Partida } from './partida.ts';

/**
 * Brinquedos de pista — anel, mola e meta (secao 9 do plano).
 *
 * Todos funcionam por toque, e o toque aqui e distancia entre duas esferas, e
 * nao colisor do Rapier. Nao e preguica: um anel *nao pode* ser solido. Se o
 * anel fosse colisor, ele empurraria o personagem, e atravessar uma fileira de
 * aneis a toda — que e a coisa mais gostosa de um jogo de Sonic — viraria
 * bater numa parede de aneis. Gatilho e colisao sao coisas diferentes.
 */

/** Anel, e o que mais der para pegar. */
export const Collectible = defineComponent(
  'Collectible',
  'Coletável',
  {
    /** Quantos aneis vale. */
    value: 'u8',
    /** Distancia de pegar. Generosa de proposito: correr rapido nao pode perder anel. */
    radius: 'f32',
    collected: 'u8',
  },
  { value: 1, radius: 1.3 },
);

/** Mola: joga o personagem na direcao do "para cima" dela. */
export const Spring = defineComponent(
  'Spring',
  'Mola',
  {
    /** Velocidade que ela imprime. */
    power: 'f32',
    radius: 'f32',
    /** Tempo ate poder disparar de novo. */
    cooldown: 'f32',
  },
  { power: 26, radius: 1.4 },
);

/** Meta: encostar aqui termina a fase. */
export const Goal = defineComponent('Goal', 'Meta', { radius: 'f32' }, { radius: 2.2 });

/** Espera entre dois disparos da mesma mola. */
const RECARGA = 0.35;
/** Tempo em que a mola desliga a aderencia, para o personagem sair mesmo. */
const SEM_GRUDAR = 0.25;

export interface TrackToysOptions {
  partida: Partida;
  /** Onde o personagem volta ao perder uma vida. */
  spawn: { x: number; y: number; z: number; yaw: number };
  /** Abaixo desta altura, caiu no buraco. */
  deathY?: number;
}

/**
 * Cuida do que acontece quando o personagem encosta nas coisas: pega anel,
 * dispara mola, termina a fase, cai no buraco.
 *
 * Roda depois do controlador de personagem: ele decide onde o personagem
 * esta, e so entao se pergunta no que ele encostou.
 */
export function trackToysSystem(options: TrackToysOptions): System {
  const { partida, spawn } = options;
  const deathY = options.deathY ?? -25;

  const personagens = view(Transform, SpeedCharacter);
  const coletaveis = view(Transform, Collectible);
  const molas = view(Transform, Spring);
  const metas = view(Transform, Goal);

  const paraCima = new THREE.Vector3();
  const giro = new THREE.Quaternion();

  return defineSystem({
    name: 'TrackToys',
    phase: 'logic',
    order: 100,
    update({ dt }) {
      partida.avancar(dt);

      const t = Transform.fields;
      const c = SpeedCharacter.fields;

      // A recarga das molas anda mesmo sem ninguem por perto.
      const s = Spring.fields;
      molas.each((_entidade, _ts, ss) => {
        if (s.cooldown[ss] > 0) s.cooldown[ss] = Math.max(0, s.cooldown[ss] - dt);
      });

      if (!partida.jogando) return;

      personagens.each((_entidade, hs, cs) => {
        const hx = t.x[hs];
        const hy = t.y[hs];
        const hz = t.z[hs];
        const raioHeroi = c.radius[cs];

        // --- Caiu no buraco ---------------------------------------------
        if (hy < deathY) {
          partida.perderVida();
          renascer(hs, cs, spawn);
          return;
        }

        // --- Aneis --------------------------------------------------------
        const col = Collectible.fields;
        coletaveis.each((_anel, ts, ks) => {
          if (col.collected[ks] === 1) return;
          const alcance = col.radius[ks] + raioHeroi;
          if (distanciaQuadrada(t, ts, hx, hy, hz) > alcance * alcance) return;
          col.collected[ks] = 1;
          // Escala zero some com a instancia sem tirar ela do lote: o anel
          // continua existindo, e voltar atras e so devolver a escala.
          t.sx[ts] = t.sy[ts] = t.sz[ts] = 0;
          partida.coletar(col.value[ks] || 1);
        });

        // --- Molas ---------------------------------------------------------
        // Duas vagas diferentes chegam aqui: `ts` indexa o Transform e `ss`
        // indexa a Mola. Trocar uma pela outra le o campo de outra entidade —
        // e como os dois sao numeros pequenos, isso nao explode: so devolve o
        // valor errado, silenciosamente.
        molas.each((_mola, ts, ss) => {
          if (s.cooldown[ss] > 0) return;
          const alcance = s.radius[ss] + raioHeroi;
          if (distanciaQuadrada(t, ts, hx, hy, hz) > alcance * alcance) return;

          // A mola empurra para o "para cima" dela, e nao para o do mundo:
          // deitada na parede, ela atira para o lado.
          giro.set(t.qx[ts], t.qy[ts], t.qz[ts], t.qw[ts]);
          paraCima.set(0, 1, 0).applyQuaternion(giro);
          const forca = s.power[ss];
          c.vx[cs] = paraCima.x * forca;
          c.vy[cs] = paraCima.y * forca;
          c.vz[cs] = paraCima.z * forca;
          c.grounded[cs] = 0;
          // Sem isto a aderencia gruda ele de volta na mola no mesmo passo.
          c.noStick[cs] = SEM_GRUDAR;
          c.coyote[cs] = 0;
          c.jumpBuffer[cs] = 0;
          s.cooldown[ss] = RECARGA;
        });

        // --- Meta ------------------------------------------------------------
        const g = Goal.fields;
        metas.each((_meta, ts, ks) => {
          const alcance = g.radius[ks] + raioHeroi;
          if (distanciaQuadrada(t, ts, hx, hy, hz) > alcance * alcance) return;
          partida.vencer();
        });
      });
    },
  });
}

/** Devolve o personagem ao ponto de partida, parado. */
export function renascer(
  ts: number,
  cs: number,
  spawn: { x: number; y: number; z: number; yaw: number },
): void {
  const t = Transform.fields;
  const c = SpeedCharacter.fields;
  t.x[ts] = t.px[ts] = spawn.x;
  t.y[ts] = t.py[ts] = spawn.y;
  t.z[ts] = t.pz[ts] = spawn.z;
  c.vx[cs] = c.vy[cs] = c.vz[cs] = 0;
  c.ux[cs] = 0;
  c.uy[cs] = 1;
  c.uz[cs] = 0;
  c.grounded[cs] = 0;
  c.yaw[cs] = spawn.yaw;
}

/** Devolve os brinquedos ao estado de antes da partida. */
export function resetTrackToys(): void {
  const col = Collectible.fields;
  for (let slot = 0; slot < Collectible.count; slot++) col.collected[slot] = 0;
  const s = Spring.fields;
  for (let slot = 0; slot < Spring.count; slot++) s.cooldown[slot] = 0;
}

/** Anel pego? Serve para o editor saber o que reposicionar ao parar o teste. */
export function foiColetado(entity: Entity): boolean {
  const slot = Collectible.slotOf(entity);
  return slot >= 0 && Collectible.fields.collected[slot] === 1;
}

function distanciaQuadrada(
  t: { x: Float32Array; y: Float32Array; z: Float32Array },
  slot: number,
  x: number,
  y: number,
  z: number,
): number {
  const dx = t.x[slot] - x;
  const dy = t.y[slot] - y;
  const dz = t.z[slot] - z;
  return dx * dx + dy * dy + dz * dz;
}
