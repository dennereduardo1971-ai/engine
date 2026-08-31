import { type Component } from './component.ts';
import { componentRegistry } from './component.ts';
import { type Entity, entityGeneration, entityIndex, makeEntity, MAX_ENTITIES } from './entity.ts';

/**
 * O mundo cuida do ciclo de vida das entidades. Os dados moram nos
 * componentes; aqui fica so quem existe e quem deixou de existir.
 */
export class World {
  private generations: Uint8Array = new Uint8Array(1024);
  private alive: Uint8Array = new Uint8Array(1024);
  private freeIndices: number[] = [];
  private nextIndex = 0;
  private liveCount = 0;

  /** Quantas entidades existem agora. */
  get count(): number {
    return this.liveCount;
  }

  create(): Entity {
    let index: number;
    const recycled = this.freeIndices.pop();
    if (recycled !== undefined) {
      index = recycled;
    } else {
      index = this.nextIndex++;
      if (index >= MAX_ENTITIES) {
        throw new Error('Faisca: limite de entidades do mundo estourado.');
      }
      if (index >= this.generations.length) this.grow(index + 1);
    }
    this.alive[index] = 1;
    this.liveCount++;
    return makeEntity(index, this.generations[index]);
  }

  /** Cria varias entidades de uma vez (pista, anel, particula). */
  createMany(quantity: number, out: Entity[] = []): Entity[] {
    for (let i = 0; i < quantity; i++) out.push(this.create());
    return out;
  }

  isAlive(entity: Entity): boolean {
    const index = entityIndex(entity);
    if (index >= this.generations.length) return false;
    return this.alive[index] === 1 && this.generations[index] === entityGeneration(entity);
  }

  /**
   * Destroi a entidade e tira todos os seus componentes. A geracao do indice
   * avanca, entao qualquer referencia guardada para ela vira invalida na hora.
   */
  destroy(entity: Entity): boolean {
    if (!this.isAlive(entity)) return false;
    const index = entityIndex(entity);
    for (const component of componentRegistry) component.remove(entity);
    this.alive[index] = 0;
    this.generations[index] = (this.generations[index] + 1) & 0xff;
    this.freeIndices.push(index);
    this.liveCount--;
    return true;
  }

  /** Esvazia o mundo inteiro (trocar de fase, recarregar a cena). */
  clear(): void {
    for (const component of componentRegistry) component.clear();
    this.generations.fill(0);
    this.alive.fill(0);
    this.freeIndices.length = 0;
    this.nextIndex = 0;
    this.liveCount = 0;
  }

  /** Atalho: cria a entidade ja com os componentes pedidos. */
  spawn(...components: Component<never>[]): Entity {
    const entity = this.create();
    for (const component of components) component.add(entity);
    return entity;
  }

  private grow(needed: number): void {
    let length = this.generations.length;
    while (length < needed) length *= 2;
    const generations = new Uint8Array(length);
    generations.set(this.generations);
    this.generations = generations;
    const alive = new Uint8Array(length);
    alive.set(this.alive);
    this.alive = alive;
  }
}
