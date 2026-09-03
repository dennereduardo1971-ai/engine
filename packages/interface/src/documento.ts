/**
 * O documento de interface — uma tela (HUD, menu) como documento editavel, e
 * nao como DOM rodando.
 *
 * Mesma separacao que `@faisca/autoria/documento.ts` faz para a cena 3D
 * (secao 4 do plano): este documento nao sabe desenhar HTML nem CSS — e uma
 * arvore de nos ancorados na tela, que o formato `.ui` transforma em texto
 * legivel, e que um futuro sistema no runtime transforma em elementos DOM de
 * verdade (fatia 3 da M9).
 */

export type Ancora =
  | 'topo-esquerda'
  | 'topo'
  | 'topo-direita'
  | 'esquerda'
  | 'centro'
  | 'direita'
  | 'baixo-esquerda'
  | 'baixo'
  | 'baixo-direita';

/** Um no da arvore: um elemento colocado na tela. */
export interface UiNode {
  readonly id: string;
  /** Nome que aparece na arvore da tela. */
  name: string;
  /** Id do elemento de origem (catalogo de `elementos.ts`). */
  elemento: string;
  parent: string | null;
  /**
   * Onde na tela o no se prende. Uma tela precisa ser responsiva: ancorar por
   * canto/borda, e nao por pixel absoluto, e o que sobrevive a tela mudar de
   * tamanho.
   */
  ancora: Ancora;
  /** Deslocamento a partir da ancora, em pixels. */
  offsetX: number;
  offsetY: number;
  /** `null` usa o tamanho de fabrica do elemento. */
  largura: number | null;
  altura: number | null;
  /** `null` usa o rotulo de fabrica do elemento. */
  texto: string | null;
  /** `null` usa a cor de fabrica do elemento. */
  cor: number | null;
  /**
   * Valores editados dos campos do elemento: `{ fontSize: 32 }`. So o que foi
   * mexido mora aqui; o resto vem dos valores de fabrica do elemento.
   */
  fields: Record<string, number>;
  visible: boolean;
}

export interface UiData {
  /** Versao do formato, para o dia em que ele mudar. */
  format: string;
  name: string;
  nodes: UiNode[];
}

/**
 * O que mudou no documento. Um futuro sistema no runtime escuta isto para
 * corrigir so o elemento DOM que mudou, e nao remontar a tela inteira a cada
 * tecla digitada num campo.
 */
export type UiChange =
  | { kind: 'add'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'ancora'; id: string }
  | { kind: 'fields'; id: string }
  | { kind: 'appearance'; id: string }
  | { kind: 'name'; id: string }
  | { kind: 'texto'; id: string }
  | { kind: 'parent'; id: string }
  /** O documento inteiro foi trocado (carregar arquivo, desfazer). */
  | { kind: 'reload' };

export type UiListener = (change: UiChange) => void;

/** Versao do formato gravada no arquivo. */
export const FORMAT_VERSION = '0.1';

export interface AddOptions {
  name?: string;
  parent?: string | null;
  ancora?: Ancora;
  offsetX?: number;
  offsetY?: number;
  largura?: number | null;
  altura?: number | null;
  texto?: string | null;
  cor?: number | null;
  fields?: Record<string, number>;
  visible?: boolean;
  /** Id fixo, usado ao carregar um arquivo. Sem isto, um id novo e gerado. */
  id?: string;
}

export class UiDocument {
  name: string;
  private readonly byId = new Map<string, UiNode>();
  /** Ordem de insercao: e a ordem que a arvore da tela mostra. */
  private order: string[] = [];
  private counter = 0;
  private readonly listeners = new Set<UiListener>();

  constructor(name = 'Tela 1') {
    this.name = name;
  }

  get nodes(): readonly UiNode[] {
    return this.order.map((id) => this.byId.get(id)!);
  }

  get count(): number {
    return this.byId.size;
  }

  get(id: string | null): UiNode | null {
    return id === null ? null : (this.byId.get(id) ?? null);
  }

  /** Filhos diretos de um no; `null` traz os nos de primeiro nivel. */
  children(parent: string | null): UiNode[] {
    const out: UiNode[] = [];
    for (const id of this.order) {
      const node = this.byId.get(id)!;
      if (node.parent === parent) out.push(node);
    }
    return out;
  }

  /** O no e todos os descendentes dele, o pai primeiro. */
  branch(id: string): UiNode[] {
    const root = this.byId.get(id);
    if (!root) return [];
    const out = [root];
    for (let i = 0; i < out.length; i++) {
      for (const child of this.children(out[i].id)) out.push(child);
    }
    return out;
  }

  add(elemento: string, options: AddOptions = {}): UiNode {
    const id = options.id ?? this.nextId();
    if (this.byId.has(id)) throw new Error(`Faisca: ja existe um no com o id "${id}".`);
    const node: UiNode = {
      id,
      name: options.name ?? elemento,
      elemento,
      parent: options.parent ?? null,
      ancora: options.ancora ?? 'topo-esquerda',
      offsetX: options.offsetX ?? 0,
      offsetY: options.offsetY ?? 0,
      largura: options.largura ?? null,
      altura: options.altura ?? null,
      texto: options.texto ?? null,
      cor: options.cor ?? null,
      fields: { ...(options.fields ?? {}) },
      visible: options.visible ?? true,
    };
    this.byId.set(id, node);
    this.order.push(id);
    this.emit({ kind: 'add', id });
    return node;
  }

  /** Tira o no e tudo que esta pendurado nele. */
  remove(id: string): boolean {
    const branch = this.branch(id);
    if (branch.length === 0) return false;
    // De tras para frente: os filhos saem antes do pai, entao quem escuta
    // nunca ve um no orfao no meio do caminho.
    for (let i = branch.length - 1; i >= 0; i--) {
      const node = branch[i];
      this.byId.delete(node.id);
      const index = this.order.indexOf(node.id);
      if (index >= 0) this.order.splice(index, 1);
      this.emit({ kind: 'remove', id: node.id });
    }
    return true;
  }

  rename(id: string, name: string): void {
    const node = this.byId.get(id);
    if (!node || node.name === name) return;
    node.name = name;
    this.emit({ kind: 'name', id });
  }

  setAncora(id: string, ancora: Ancora, offsetX = 0, offsetY = 0): void {
    const node = this.byId.get(id);
    if (!node) return;
    if (node.ancora === ancora && node.offsetX === offsetX && node.offsetY === offsetY) return;
    node.ancora = ancora;
    node.offsetX = offsetX;
    node.offsetY = offsetY;
    this.emit({ kind: 'ancora', id });
  }

  setOffset(id: string, offsetX: number, offsetY: number): void {
    const node = this.byId.get(id);
    if (!node || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return;
    if (node.offsetX === offsetX && node.offsetY === offsetY) return;
    node.offsetX = offsetX;
    node.offsetY = offsetY;
    this.emit({ kind: 'ancora', id });
  }

  setTexto(id: string, texto: string | null): void {
    const node = this.byId.get(id);
    if (!node || node.texto === texto) return;
    node.texto = texto;
    this.emit({ kind: 'texto', id });
  }

  setCor(id: string, cor: number | null): void {
    const node = this.byId.get(id);
    if (!node || node.cor === cor) return;
    node.cor = cor;
    this.emit({ kind: 'appearance', id });
  }

  setFields(id: string, patch: Record<string, number>): void {
    const node = this.byId.get(id);
    if (!node) return;
    let changed = false;
    for (const [campo, valor] of Object.entries(patch)) {
      if (!Number.isFinite(valor) || node.fields[campo] === valor) continue;
      node.fields[campo] = valor;
      changed = true;
    }
    if (changed) this.emit({ kind: 'fields', id });
  }

  setName(id: string, name: string): void {
    this.rename(id, name);
  }

  setVisible(id: string, visible: boolean): void {
    const node = this.byId.get(id);
    if (!node || node.visible === visible) return;
    node.visible = visible;
    this.emit({ kind: 'appearance', id });
  }

  /**
   * Troca o pai. Recusa pendurar um no dentro do proprio galho — isso soltaria
   * o galho da arvore e ele viraria um pedaco de tela invisivel e impossivel
   * de selecionar.
   */
  setParent(id: string, parent: string | null): boolean {
    const node = this.byId.get(id);
    if (!node || node.parent === parent) return false;
    if (parent !== null) {
      if (parent === id) return false;
      if (!this.byId.has(parent)) return false;
      for (const descendant of this.branch(id)) {
        if (descendant.id === parent) return false;
      }
    }
    node.parent = parent;
    this.emit({ kind: 'parent', id });
    return true;
  }

  on(listener: UiListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toData(): UiData {
    return {
      format: FORMAT_VERSION,
      name: this.name,
      nodes: this.nodes.map((node) => ({ ...node, fields: { ...node.fields } })),
    };
  }

  /** Troca o conteudo inteiro. Um unico aviso `reload` sai no fim. */
  load(data: UiData): void {
    this.name = data.name;
    this.byId.clear();
    this.order = [];
    this.counter = 0;
    for (const node of data.nodes) {
      const copy: UiNode = {
        id: node.id,
        name: node.name,
        elemento: node.elemento,
        parent: node.parent ?? null,
        ancora: node.ancora ?? 'topo-esquerda',
        offsetX: node.offsetX ?? 0,
        offsetY: node.offsetY ?? 0,
        largura: node.largura ?? null,
        altura: node.altura ?? null,
        texto: node.texto ?? null,
        cor: node.cor ?? null,
        fields: { ...(node.fields ?? {}) },
        visible: node.visible !== false,
      };
      this.byId.set(copy.id, copy);
      this.order.push(copy.id);
      // O contador precisa passar por cima de qualquer id ja usado, senao um
      // no novo nasceria com o id de um que ja esta na tela.
      const numeric = /^n(\d+)$/.exec(copy.id);
      if (numeric) this.counter = Math.max(this.counter, Number(numeric[1]));
    }
    // Pai que nao existe mais vira raiz, em vez de sumir da arvore.
    for (const node of this.byId.values()) {
      if (node.parent !== null && !this.byId.has(node.parent)) node.parent = null;
    }
    this.emit({ kind: 'reload' });
  }

  static fromData(data: UiData): UiDocument {
    const document = new UiDocument(data.name);
    document.load(data);
    return document;
  }

  private nextId(): string {
    return `n${++this.counter}`;
  }

  private emit(change: UiChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
