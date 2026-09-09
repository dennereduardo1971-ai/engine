/**
 * O documento de cena — a fase como um documento editavel, e nao como um
 * mundo rodando.
 *
 * Esta e a peca central da camada de autoria (secao 4 do plano). Ela nao sabe
 * desenhar, nao sabe simular e nao conhece o Three.js: e uma arvore de nos com
 * valores, que o montador transforma em entidades do ECS e o formato `.cena`
 * transforma em texto legivel.
 *
 * A separacao paga duas coisas de uma vez:
 *
 * 1. **Salvar e carregar** ficam triviais — o documento *e* o arquivo.
 * 2. **Hot reload** fica possivel — mudar um valor aqui emite um aviso, e o
 *    montador corrige o mundo vivo sem reiniciar a fase (secao 8 do plano).
 */

import { type Script } from '@faisca/blocos';
import { type SplinePoint } from './spline.ts';

/** Onde o no esta, para onde aponta e o tamanho dele. */
export interface NodeTransform {
  x: number;
  y: number;
  z: number;
  /**
   * Guinada em graus, e nao em radianos nem em quaternion.
   *
   * Quem edita e uma pessoa: "45 graus" e um numero que da para digitar, e as
   * pecas modulares do plano encaixam em angulos fixos (secao 9). O montador
   * converte para o quaternion do Transform na hora de montar o mundo.
   */
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Os pontos de uma pista desenhada (secao 9: spline de pista, a M7).
 *
 * Um no com `spline` guarda os pontos em coordenadas de mundo — a pista e
 * desenhada clicando no viewport, e nao ha "pai" para compor, entao o
 * `transform` do no fica na identidade e e ignorado ao montar.
 */
export interface SplineData {
  pontos: SplinePoint[];
  /** Fecha a pista num laco, ligando o ultimo ponto ao primeiro. */
  fechada: boolean;
}

/** Um no da arvore: uma peca colocada na fase. */
export interface SceneNode {
  readonly id: string;
  /** Nome que aparece na arvore de cena. */
  name: string;
  /** Id da peca de origem (secao 9: pecas modulares). */
  piece: string;
  parent: string | null;
  transform: NodeTransform;
  /** Presente so nos nos de pista desenhada (secao 9: spline de pista). */
  spline?: SplineData | null;
  /**
   * Caminho do modelo 3D importado que este no desenha, nos nos da peca
   * `modelo` (secao 11: importacao de glTF/GLB).
   *
   * E o *caminho* dentro de `assets/`, e nao os bytes nem um id: e ele que
   * o catalogo usa como chave, e e por isso que trocar o arquivo no disco e
   * reimportar troca o modelo de todo mundo que aponta para ele, sem mexer
   * na cena.
   */
  modelo?: string | null;
  /**
   * Valores editados dos componentes, por nome de componente no codigo:
   * `{ SpeedCharacter: { maxSpeed: 30 } }`. So o que foi mexido mora aqui; o
   * resto vem dos valores de fabrica do componente.
   */
  fields: Record<string, Record<string, number>>;
  /** Cor propria, ou `null` para usar a da peca. */
  color: number | null;
  visible: boolean;
  /**
   * O script da peca — a arvore da secao 7, guardada aqui inteira.
   *
   * E a arvore, e nao o texto do codigo: o texto e uma das *visoes* dela, e
   * guardar uma visao como se fosse o original e exatamente o erro que a
   * secao 7 manda nao cometer.
   */
  script?: Script | null;
}

export interface SceneData {
  /** Versao do formato, para o dia em que ele mudar. */
  format: string;
  name: string;
  nodes: SceneNode[];
}

/**
 * O que mudou no documento. O montador escuta isto para corrigir so o que
 * precisa — remontar a fase inteira a cada tecla digitada num campo seria
 * exatamente o "reiniciar a fase" que o plano quer eliminar.
 */
export type SceneChange =
  | { kind: 'add'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'transform'; id: string }
  | { kind: 'spline'; id: string }
  | { kind: 'modelo'; id: string }
  | { kind: 'fields'; id: string; component: string }
  | { kind: 'appearance'; id: string }
  | { kind: 'name'; id: string }
  | { kind: 'script'; id: string }
  | { kind: 'parent'; id: string }
  /** O documento inteiro foi trocado (carregar arquivo, desfazer). */
  | { kind: 'reload' };

export type SceneListener = (change: SceneChange) => void;

/** Transformacao neutra: na origem, sem giro, tamanho 1. */
export function identityTransform(): NodeTransform {
  return { x: 0, y: 0, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1 };
}

export interface AddOptions {
  name?: string;
  parent?: string | null;
  transform?: Partial<NodeTransform>;
  fields?: Record<string, Record<string, number>>;
  color?: number | null;
  visible?: boolean;
  /** Id fixo, usado ao carregar um arquivo. Sem isto, um id novo e gerado. */
  id?: string;
  script?: Script | null;
  spline?: SplineData | null;
  modelo?: string | null;
}

export class SceneDocument {
  name: string;
  private readonly byId = new Map<string, SceneNode>();
  /** Ordem de insercao: e a ordem que a arvore de cena mostra. */
  private order: string[] = [];
  private counter = 0;
  private readonly listeners = new Set<SceneListener>();

  constructor(name = 'Fase 1') {
    this.name = name;
  }

  get nodes(): readonly SceneNode[] {
    return this.order.map((id) => this.byId.get(id)!);
  }

  get count(): number {
    return this.byId.size;
  }

  get(id: string | null): SceneNode | null {
    return id === null ? null : (this.byId.get(id) ?? null);
  }

  /** Filhos diretos de um no; `null` traz os nos de primeiro nivel. */
  children(parent: string | null): SceneNode[] {
    const out: SceneNode[] = [];
    for (const id of this.order) {
      const node = this.byId.get(id)!;
      if (node.parent === parent) out.push(node);
    }
    return out;
  }

  /** O no e todos os descendentes dele, o pai primeiro. */
  branch(id: string): SceneNode[] {
    const root = this.byId.get(id);
    if (!root) return [];
    const out = [root];
    for (let i = 0; i < out.length; i++) {
      for (const child of this.children(out[i].id)) out.push(child);
    }
    return out;
  }

  /** Primeiro no de uma peca — e assim que se acha o ponto de partida. */
  firstOfPiece(piece: string): SceneNode | null {
    for (const id of this.order) {
      const node = this.byId.get(id)!;
      if (node.piece === piece) return node;
    }
    return null;
  }

  add(piece: string, options: AddOptions = {}): SceneNode {
    const id = options.id ?? this.nextId();
    if (this.byId.has(id)) throw new Error(`Faisca: ja existe um no com o id "${id}".`);
    const node: SceneNode = {
      id,
      name: options.name ?? piece,
      piece,
      parent: options.parent ?? null,
      transform: { ...identityTransform(), ...options.transform },
      fields: cloneFields(options.fields ?? {}),
      color: options.color ?? null,
      visible: options.visible ?? true,
      script: options.script ?? null,
      spline: options.spline ? cloneSpline(options.spline) : null,
      modelo: options.modelo ?? null,
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

  setTransform(id: string, patch: Partial<NodeTransform>): void {
    const node = this.byId.get(id);
    if (!node) return;
    let changed = false;
    for (const [key, value] of Object.entries(patch) as [keyof NodeTransform, number][]) {
      if (!Number.isFinite(value) || node.transform[key] === value) continue;
      node.transform[key] = value;
      changed = true;
    }
    if (changed) this.emit({ kind: 'transform', id });
  }

  /**
   * Troca o script de uma peca.
   *
   * A arvore entra por copia: quem editou continua com a dela, e o documento
   * fica com a sua. Duas partes do editor apontando para a mesma arvore
   * viravam, mais cedo ou mais tarde, uma mudanca que aparece antes de ser
   * confirmada — ou um desfazer que nao desfaz.
   */
  setScript(id: string, script: Script | null): void {
    const node = this.byId.get(id);
    if (!node) return;
    node.script = script ? structuredClone(script) : null;
    this.emit({ kind: 'script', id });
  }

  /**
   * Troca os pontos de uma pista desenhada.
   *
   * Igual ao script (setScript): entra por copia, para o rascunho de quem
   * ainda esta desenhando no viewport nunca ser o mesmo array que o
   * documento guarda.
   */
  setSpline(id: string, data: SplineData | null): void {
    const node = this.byId.get(id);
    if (!node) return;
    node.spline = data ? cloneSpline(data) : null;
    this.emit({ kind: 'spline', id });
  }

  /**
   * Aponta o no para um modelo importado (ou tira o modelo, com `null`).
   *
   * Nao valida o caminho de proposito: quem sabe se o arquivo existe e o
   * catalogo de assets, que mora no editor. Um caminho que nao abre vira um
   * aviso na tela, e nao um no perdido — do mesmo jeito que uma peca
   * desconhecida vira um cubo roxo em vez de sumir.
   */
  setModelo(id: string, caminho: string | null): void {
    const node = this.byId.get(id);
    if (!node || (node.modelo ?? null) === caminho) return;
    node.modelo = caminho;
    this.emit({ kind: 'modelo', id });
  }

  setField(id: string, component: string, field: string, value: number): void {
    const node = this.byId.get(id);
    if (!node || !Number.isFinite(value)) return;
    const bag = (node.fields[component] ??= {});
    if (bag[field] === value) return;
    bag[field] = value;
    this.emit({ kind: 'fields', id, component });
  }

  /** Poe o componente no no, com os valores dados (ou nenhum). */
  addComponent(id: string, component: string, values: Record<string, number> = {}): void {
    const node = this.byId.get(id);
    if (!node || node.fields[component]) return;
    node.fields[component] = { ...values };
    this.emit({ kind: 'fields', id, component });
  }

  removeComponent(id: string, component: string): void {
    const node = this.byId.get(id);
    if (!node || !node.fields[component]) return;
    delete node.fields[component];
    this.emit({ kind: 'fields', id, component });
  }

  setColor(id: string, color: number | null): void {
    const node = this.byId.get(id);
    if (!node || node.color === color) return;
    node.color = color;
    this.emit({ kind: 'appearance', id });
  }

  setVisible(id: string, visible: boolean): void {
    const node = this.byId.get(id);
    if (!node || node.visible === visible) return;
    node.visible = visible;
    this.emit({ kind: 'appearance', id });
  }

  /**
   * Troca o pai. Recusa pendurar um no dentro do proprio galho — isso soltaria
   * o galho da arvore e ele viraria um pedaco de cena invisivel e impossivel
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

  /** Copia o no e o galho dele, deslocando a copia para nao ficar por baixo. */
  duplicate(id: string, offset = { x: 0, y: 0, z: 0 }): SceneNode | null {
    const branch = this.branch(id);
    if (branch.length === 0) return null;
    const remap = new Map<string, string>();
    let first: SceneNode | null = null;

    for (const node of branch) {
      const copy = this.add(node.piece, {
        name: node === branch[0] ? nextName(node.name) : node.name,
        parent: node.parent === null ? null : (remap.get(node.parent) ?? node.parent),
        transform: { ...node.transform },
        fields: node.fields,
        color: node.color,
        visible: node.visible,
        script: node.script,
        spline: node.spline,
        modelo: node.modelo,
      });
      remap.set(node.id, copy.id);
      first ??= copy;
    }

    if (first) {
      this.setTransform(first.id, {
        x: first.transform.x + offset.x,
        y: first.transform.y + offset.y,
        z: first.transform.z + offset.z,
      });
    }
    return first;
  }

  on(listener: SceneListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toJSON(): SceneData {
    return {
      format: FORMAT_VERSION,
      name: this.name,
      nodes: this.nodes.map((node) => ({
        ...node,
        transform: { ...node.transform },
        fields: cloneFields(node.fields),
        spline: node.spline ? cloneSpline(node.spline) : null,
        modelo: node.modelo ?? null,
      })),
    };
  }

  /** Troca o conteudo inteiro. Um unico aviso `reload` sai no fim. */
  load(data: SceneData): void {
    this.name = data.name;
    this.byId.clear();
    this.order = [];
    this.counter = 0;
    for (const node of data.nodes) {
      const copy: SceneNode = {
        id: node.id,
        name: node.name,
        piece: node.piece,
        parent: node.parent ?? null,
        transform: { ...identityTransform(), ...node.transform },
        fields: cloneFields(node.fields ?? {}),
        color: node.color ?? null,
        visible: node.visible !== false,
        script: node.script ?? null,
        spline: node.spline ? cloneSpline(node.spline) : null,
        modelo: node.modelo ?? null,
      };
      this.byId.set(copy.id, copy);
      this.order.push(copy.id);
      // O contador precisa passar por cima de qualquer id ja usado, senao um
      // no novo nasceria com o id de um que ja esta na cena.
      const numeric = /^n(\d+)$/.exec(copy.id);
      if (numeric) this.counter = Math.max(this.counter, Number(numeric[1]));
    }
    // Pai que nao existe mais vira raiz, em vez de sumir da arvore.
    for (const node of this.byId.values()) {
      if (node.parent !== null && !this.byId.has(node.parent)) node.parent = null;
    }
    this.emit({ kind: 'reload' });
  }

  static fromJSON(data: SceneData): SceneDocument {
    const document = new SceneDocument(data.name);
    document.load(data);
    return document;
  }

  private nextId(): string {
    return `n${++this.counter}`;
  }

  private emit(change: SceneChange): void {
    for (const listener of this.listeners) listener(change);
  }
}

/** Versao do formato gravada no arquivo. */
export const FORMAT_VERSION = '0.2';

function cloneSpline(data: SplineData): SplineData {
  return { pontos: data.pontos.map((ponto) => ({ ...ponto })), fechada: data.fechada };
}

function cloneFields(
  fields: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [component, values] of Object.entries(fields)) out[component] = { ...values };
  return out;
}

/** "Reta A" -> "Reta A 2" -> "Reta A 3": copia nao vira "Reta A" duas vezes. */
function nextName(name: string): string {
  const match = /^(.*?) (\d+)$/.exec(name);
  if (match) return `${match[1]} ${Number(match[2]) + 1}`;
  return `${name} 2`;
}
