import { type SceneData, type SceneDocument } from './documento.ts';

/**
 * Desfazer e refazer.
 *
 * A camada de autoria do plano (secao 4) lista undo ao lado dos blocos e do
 * documento CRDT. Aqui ele e feito do jeito mais simples que funciona: uma
 * pilha de fotografias do documento inteiro. Uma fase da M3 tem dezenas de
 * pecas, e uma fotografia dessas e um objeto pequeno — trocar isso por um
 * diario de comandos invertiveis so vale a pena quando o Yjs entrar, e ai a
 * conversa e outra.
 *
 * Duas coisas fazem diferenca no uso:
 *
 * - `record` e chamado *antes* da mudanca, e guarda o estado de antes.
 * - Arrastar uma peca ou puxar um deslizador junta tudo numa entrada so
 *   (`agrupar`), senao um arrasto de dois segundos enterraria o historico em
 *   cem passos identicos.
 */
export interface HistoryOptions {
  /** Quantos passos guardar. */
  limit?: number;
  /** Janela em que duas mudancas com a mesma etiqueta viram uma so. */
  coalesceMs?: number;
  now?: () => number;
}

interface Entry {
  label: string;
  data: SceneData;
}

export class History {
  private readonly past: Entry[] = [];
  private readonly future: Entry[] = [];
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();

  private lastKey: string | null = null;
  private lastTime = 0;

  constructor(
    private readonly document: SceneDocument,
    options: HistoryOptions = {},
  ) {
    this.limit = options.limit ?? 120;
    this.coalesceMs = options.coalesceMs ?? 700;
    this.now = options.now ?? (() => Date.now());
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** O que o botao "Desfazer" vai desfazer, para escrever no botao. */
  get undoLabel(): string | null {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  /**
   * Guarda o estado atual antes de uma mudanca.
   *
   * `agrupar` e uma chave: enquanto ela nao mudar e as mudancas continuarem
   * chegando dentro da janela, tudo entra no mesmo passo de desfazer.
   */
  record(label: string, agrupar?: string): void {
    const agora = this.now();
    if (
      agrupar !== undefined &&
      agrupar === this.lastKey &&
      agora - this.lastTime < this.coalesceMs &&
      this.past.length > 0
    ) {
      this.lastTime = agora;
      return;
    }

    this.past.push({ label, data: this.document.toJSON() });
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
    this.lastKey = agrupar ?? null;
    this.lastTime = agora;
    this.emit();
  }

  undo(): boolean {
    const entrada = this.past.pop();
    if (!entrada) return false;
    this.future.push({ label: entrada.label, data: this.document.toJSON() });
    this.document.load(entrada.data);
    this.breakGroup();
    this.emit();
    return true;
  }

  redo(): boolean {
    const entrada = this.future.pop();
    if (!entrada) return false;
    this.past.push({ label: entrada.label, data: this.document.toJSON() });
    this.document.load(entrada.data);
    this.breakGroup();
    this.emit();
    return true;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
    this.breakGroup();
    this.emit();
  }

  on(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Fecha o agrupamento: a proxima mudanca vira um passo novo. */
  breakGroup(): void {
    this.lastKey = null;
    this.lastTime = 0;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
