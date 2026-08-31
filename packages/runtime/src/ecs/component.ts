import { type Entity, entityIndex } from './entity.ts';

/**
 * Tipos de campo aceitos num componente. Sao todos tipos de array tipado:
 * o dado de mil inimigos fica em memoria contigua, e percorrer isso e rapido
 * mesmo numa maquina modesta.
 */
export type FieldType = 'f32' | 'f64' | 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'u32';

export type Schema = Readonly<Record<string, FieldType>>;

type ArrayOf<T extends FieldType> = T extends 'f32'
  ? Float32Array
  : T extends 'f64'
    ? Float64Array
    : T extends 'i8'
      ? Int8Array
      : T extends 'u8'
        ? Uint8Array
        : T extends 'i16'
          ? Int16Array
          : T extends 'u16'
            ? Uint16Array
            : T extends 'i32'
              ? Int32Array
              : Uint32Array;

export type Fields<S extends Schema> = { [K in keyof S]: ArrayOf<S[K]> };

const CONSTRUCTORS = {
  f32: Float32Array,
  f64: Float64Array,
  i8: Int8Array,
  u8: Uint8Array,
  i16: Int16Array,
  u16: Uint16Array,
  i32: Int32Array,
  u32: Uint32Array,
} as const;

/** Posicao invalida dentro do armazenamento denso. */
export const NO_SLOT = -1;

const INITIAL_CAPACITY = 256;

let nextComponentId = 0;

/**
 * Um componente e, ao mesmo tempo, a definicao ("o que e Vida") e o
 * armazenamento ("a vida de todo mundo"), guardado em formato denso:
 *
 *   sparse:  indice da entidade  -> vaga (slot)
 *   dense:   vaga (slot)         -> entidade
 *   fields:  vaga (slot)         -> valor de cada campo
 *
 * Quem tem o componente ocupa vagas de 0 a `count - 1`, sem buracos. Um
 * sistema que percorre `Vida` percorre memoria contigua do inicio ao fim.
 */
export class Component<S extends Schema = Schema> {
  readonly id: number = nextComponentId++;
  /** Nome no codigo, em ingles. */
  readonly name: string;
  /** Nome na interface, em portugues (secao 6 do plano). */
  readonly label: string;
  readonly schema: S;

  /**
   * Arrays por campo, indexados pela vaga.
   *
   * Cuidado: os arrays sao trocados quando o armazenamento cresce. Leia
   * `componente.fields.x` dentro do laco, ou nao adicione entidades no meio
   * de uma iteracao que segurou o array numa variavel.
   */
  fields: Fields<S>;

  private sparse: Int32Array = new Int32Array(INITIAL_CAPACITY).fill(NO_SLOT);
  private dense: Uint32Array = new Uint32Array(INITIAL_CAPACITY);
  private size = 0;
  private capacity = INITIAL_CAPACITY;

  constructor(name: string, label: string, schema: S) {
    this.name = name;
    this.label = label;
    this.schema = schema;
    this.fields = {} as Fields<S>;
    for (const key of Object.keys(schema) as (keyof S & string)[]) {
      const Ctor = CONSTRUCTORS[schema[key]];
      (this.fields as Record<string, ArrayBufferView>)[key] = new Ctor(INITIAL_CAPACITY);
    }
  }

  /** Quantas entidades tem este componente agora. */
  get count(): number {
    return this.size;
  }

  /** Entidades que tem este componente, densas em [0, count). */
  get entities(): Uint32Array {
    return this.dense;
  }

  has(entity: Entity): boolean {
    return this.slotOf(entity) !== NO_SLOT;
  }

  /** Vaga da entidade, ou `NO_SLOT` se ela nao tem o componente. */
  slotOf(entity: Entity): number {
    const index = entityIndex(entity);
    if (index >= this.sparse.length) return NO_SLOT;
    const slot = this.sparse[index];
    if (slot === NO_SLOT) return NO_SLOT;
    return this.dense[slot] === entity ? slot : NO_SLOT;
  }

  /**
   * Adiciona o componente a entidade e devolve a vaga. Se ela ja tiver,
   * devolve a vaga existente sem zerar os valores.
   */
  add(entity: Entity): number {
    const existing = this.slotOf(entity);
    if (existing !== NO_SLOT) return existing;

    const index = entityIndex(entity);
    if (index >= this.sparse.length) this.growSparse(index + 1);
    if (this.size >= this.capacity) this.growDense(this.capacity * 2);

    const slot = this.size++;
    this.dense[slot] = entity;
    this.sparse[index] = slot;
    for (const key of Object.keys(this.schema)) {
      (this.fields as Record<string, ArrayBufferView & { [i: number]: number }>)[key][slot] = 0;
    }
    return slot;
  }

  /**
   * Remove o componente. A ultima vaga e movida para o buraco (swap-remove),
   * o que mantem o armazenamento denso ao custo de nao preservar a ordem.
   */
  remove(entity: Entity): boolean {
    const slot = this.slotOf(entity);
    if (slot === NO_SLOT) return false;

    const last = --this.size;
    if (slot !== last) {
      const moved = this.dense[last];
      this.dense[slot] = moved;
      this.sparse[entityIndex(moved)] = slot;
      for (const key of Object.keys(this.schema)) {
        const array = (this.fields as Record<string, { [i: number]: number }>)[key];
        array[slot] = array[last];
      }
    }
    this.sparse[entityIndex(entity)] = NO_SLOT;
    return true;
  }

  clear(): void {
    this.sparse.fill(NO_SLOT);
    this.size = 0;
  }

  private growSparse(needed: number): void {
    let length = this.sparse.length;
    while (length < needed) length *= 2;
    const sparse = new Int32Array(length).fill(NO_SLOT);
    sparse.set(this.sparse);
    this.sparse = sparse;
  }

  private growDense(capacity: number): void {
    const dense = new Uint32Array(capacity);
    dense.set(this.dense);
    this.dense = dense;

    const fields = {} as Record<string, ArrayBufferView>;
    for (const key of Object.keys(this.schema) as (keyof S & string)[]) {
      const Ctor = CONSTRUCTORS[this.schema[key]];
      const grown = new Ctor(capacity);
      grown.set((this.fields as Record<string, ArrayLike<number>>)[key] as never);
      fields[key] = grown;
    }
    this.fields = fields as Fields<S>;
    this.capacity = capacity;
  }
}

/** Todos os componentes definidos, na ordem de definicao. */
export const componentRegistry: Component[] = [];

/**
 * Define um componente.
 *
 *   const Vida = defineComponent('Health', 'Vida', { atual: 'i16', maxima: 'i16' });
 *   const vaga = Vida.add(inimigo);
 *   Vida.fields.atual[vaga] = 3;
 */
export function defineComponent<S extends Schema>(
  name: string,
  label: string,
  schema: S,
): Component<S> {
  const component = new Component(name, label, schema);
  componentRegistry.push(component as Component);
  return component;
}

/** Componente sem dados, usado so como marcador ("isto e um anel"). */
export function defineTag(name: string, label: string): Component<Record<string, never>> {
  return defineComponent(name, label, {} as Record<string, never>);
}
