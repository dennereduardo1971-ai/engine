/**
 * Save — o progresso do jogador, guardado na maquina dele.
 *
 * Duas promessas do plano moram aqui. A primeira e a secao 13: **zero
 * telemetria**. Isto grava no `localStorage` do navegador e mais nada; nenhum
 * dado sai do computador da familia sem uma acao explicita.
 *
 * A segunda e que um save nunca pode quebrar o jogo. Um arquivo de outra
 * versao, um JSON pela metade, um navegador em aba anonima que recusa gravar —
 * tudo isso vira "nao ha save", e o jogo comeca do comeco. Perder o recorde e
 * chato; nao abrir o jogo e pior.
 */

export interface SaveOptions {
  /** Onde guardar. Padrao: `localStorage`, quando existir. */
  storage?: Storage | null;
  /** Prefixo das chaves, para dois jogos nao se atrapalharem. */
  prefix?: string;
}

/** Guarda uma coisa so, com versao. */
export class SaveSlot<T> {
  private readonly storage: Storage | null;
  private readonly fullKey: string;

  constructor(
    readonly key: string,
    /** Suba a versao quando o formato mudar: saves antigos passam a ser ignorados. */
    readonly version: number,
    options: SaveOptions = {},
  ) {
    this.storage =
      options.storage !== undefined ? options.storage : pegarArmazenamento();
    this.fullKey = `${options.prefix ?? 'faisca'}:${key}`;
  }

  /** Da para gravar aqui? Falso em aba anonima ou navegador travado. */
  get available(): boolean {
    return this.storage !== null;
  }

  /** Le o save, ou null se nao ha um valido. Nunca lanca. */
  read(): T | null {
    if (!this.storage) return null;
    let bruto: string | null = null;
    try {
      bruto = this.storage.getItem(this.fullKey);
    } catch {
      return null;
    }
    if (!bruto) return null;

    try {
      const pacote = JSON.parse(bruto) as { v?: number; d?: T };
      // Save de outra versao nao e erro: e so um save que nao serve mais.
      if (pacote?.v !== this.version) return null;
      return (pacote.d ?? null) as T | null;
    } catch {
      return null;
    }
  }

  /** Grava. Devolve falso se o navegador nao deixou (cota, aba anonima). */
  write(value: T): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.fullKey, JSON.stringify({ v: this.version, d: value }));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(this.fullKey);
    } catch {
      // Nao poder apagar nao pode derrubar o jogo.
    }
  }
}

/**
 * Armazenamento em memoria, para teste e para quando o navegador recusa o
 * `localStorage`. Vale enquanto a pagina estiver aberta.
 */
export class MemoryStorage implements Storage {
  private readonly dados = new Map<string, string>();

  get length(): number {
    return this.dados.size;
  }

  clear(): void {
    this.dados.clear();
  }

  getItem(key: string): string | null {
    return this.dados.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.dados.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.dados.delete(key);
  }

  setItem(key: string, value: string): void {
    this.dados.set(key, value);
  }
}

function pegarArmazenamento(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Alguns navegadores expoem o objeto e so recusam na hora de gravar.
    const teste = '__faisca__';
    localStorage.setItem(teste, '1');
    localStorage.removeItem(teste);
    return localStorage;
  } catch {
    return null;
  }
}
