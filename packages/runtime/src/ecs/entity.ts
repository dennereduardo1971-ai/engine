/**
 * Entidade = um numero de 32 bits: 24 bits de indice + 8 bits de geracao.
 *
 * A geracao existe para pegar o bug classico: guardar a referencia de um
 * inimigo, o inimigo morrer, o indice ser reciclado por outro objeto, e a
 * referencia velha passar a apontar para o objeto errado sem ninguem notar.
 * Com geracao, a referencia velha simplesmente deixa de ser valida.
 */
export type Entity = number;

const INDEX_BITS = 24;
export const MAX_ENTITIES = 1 << INDEX_BITS; // 16.777.216
const INDEX_MASK = MAX_ENTITIES - 1;
const GENERATION_MASK = 0xff;

/** Entidade nula: nunca e devolvida por `World.create()`. */
export const NO_ENTITY: Entity = 0xffffffff;

export function makeEntity(index: number, generation: number): Entity {
  return (((generation & GENERATION_MASK) << INDEX_BITS) | (index & INDEX_MASK)) >>> 0;
}

export function entityIndex(entity: Entity): number {
  return entity & INDEX_MASK;
}

export function entityGeneration(entity: Entity): number {
  return (entity >>> INDEX_BITS) & GENERATION_MASK;
}
