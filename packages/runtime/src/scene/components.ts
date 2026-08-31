import { defineComponent } from '../ecs/component.ts';
import { type Entity } from '../ecs/entity.ts';

/**
 * Onde o objeto esta, para onde ele aponta e qual o tamanho dele.
 *
 * A rotacao e um quaternion, nao tres angulos. O Kit Velocidade precisa que o
 * personagem tenha um "para cima" proprio, alinhado a normal do chao, para
 * loops e paredes funcionarem — e angulos de Euler travam (gimbal lock) na
 * hora exata em que o personagem fica de cabeca para baixo dentro do loop.
 *
 * Os campos `p*` guardam o estado do passo anterior. Como a simulacao anda em
 * passo fixo e a tela desenha quando pode, o desenho interpola entre o passo
 * anterior e o atual — e por isso que 60 passos por segundo continuam suaves
 * numa tela de 144 Hz, e nao tremem numa de 30.
 */
export const Transform = defineComponent('Transform', 'Transformar', {
  x: 'f32',
  y: 'f32',
  z: 'f32',
  qx: 'f32',
  qy: 'f32',
  qz: 'f32',
  qw: 'f32',
  sx: 'f32',
  sy: 'f32',
  sz: 'f32',
  px: 'f32',
  py: 'f32',
  pz: 'f32',
  pqx: 'f32',
  pqy: 'f32',
  pqz: 'f32',
  pqw: 'f32',
});

/** Velocidade em unidades por segundo. */
export const Velocity = defineComponent('Velocity', 'Velocidade', {
  x: 'f32',
  y: 'f32',
  z: 'f32',
});

/** Liga a entidade a um objeto do Three.js guardado no registro da cena. */
export const Visual = defineComponent('Visual', 'Visual', {
  handle: 'u32',
});

/** Liga a entidade a uma vaga dentro de um lote instanciado. */
export const Instanced = defineComponent('Instanced', 'Instanciado', {
  batch: 'u16',
  index: 'u32',
});

/**
 * Coloca a entidade no mundo com escala 1 e sem rotacao, ja com o passo
 * anterior igual ao atual (senao o primeiro quadro desenha um risco do zero
 * ate a posicao real).
 */
export function placeAt(entity: Entity, x: number, y: number, z: number): number {
  const slot = Transform.add(entity);
  const f = Transform.fields;
  f.x[slot] = f.px[slot] = x;
  f.y[slot] = f.py[slot] = y;
  f.z[slot] = f.pz[slot] = z;
  f.qx[slot] = f.qy[slot] = f.qz[slot] = 0;
  f.qw[slot] = 1;
  f.pqx[slot] = f.pqy[slot] = f.pqz[slot] = 0;
  f.pqw[slot] = 1;
  f.sx[slot] = f.sy[slot] = f.sz[slot] = 1;
  return slot;
}
