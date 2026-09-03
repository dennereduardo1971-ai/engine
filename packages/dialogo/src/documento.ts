/**
 * A conversa como documento editavel — a secao 10 do plano ("balões de fala,
 * escolhas") em codigo.
 *
 * Mesma separacao que `@faisca/interface/documento.ts` faz para a tela: este
 * documento nao sabe desenhar balao nenhum, nao sabe de DOM e nao sabe de
 * tempo. Ele e uma lista de passos ligados por id, que o formato `.dialogo`
 * grava em texto legivel e que a maquina de `maquina.ts` percorre.
 *
 * Um passo e sempre uma fala. Se ele tiver opcoes, a fala e uma pergunta e o
 * jogador escolhe; se nao tiver, ele segue para `proxima`. Nao existe "no de
 * escolha" separado do "no de fala" de proposito: no jogo, a pergunta *e* um
 * balao, e separar as duas coisas obrigaria a montar dois nos para dizer uma
 * frase so.
 */

export const FORMAT_VERSION = '1';

/** Uma resposta possivel. `destino` nulo encerra a conversa. */
export interface Opcao {
  texto: string;
  destino: string | null;
}

export interface Passo {
  readonly id: string;
  /** Quem fala. Vazio e o narrador. */
  quem: string;
  texto: string;
  /** Vazio: e uma fala simples e a conversa segue para `proxima`. */
  opcoes: Opcao[];
  /** Proximo passo de uma fala simples. `null` encerra a conversa. */
  proxima: string | null;
}

export interface ConversaData {
  format: string;
  name: string;
  passos: Passo[];
}

export type ConversaChange =
  | { kind: 'add'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'texto'; id: string }
  | { kind: 'ligacao'; id: string }
  | { kind: 'opcoes'; id: string }
  | { kind: 'nome' }
  /** O documento inteiro foi trocado (carregar arquivo). */
  | { kind: 'reload' };

export type ConversaListener = (change: ConversaChange) => void;

/**
 * Uma conversa. As mutacoes sao pequenas e avisam o que mudou, para o painel
 * do editor corrigir uma linha e nao remontar a lista a cada tecla.
 */
export class Conversa {
  name: string;
  private readonly passos: Passo[] = [];
  private readonly porId = new Map<string, Passo>();
  private readonly listeners = new Set<ConversaListener>();
  private proximoId = 1;

  constructor(name = 'Conversa 1') {
    this.name = name;
  }

  get lista(): readonly Passo[] {
    return this.passos;
  }

  /** O primeiro passo da lista e por onde a conversa comeca. */
  get inicio(): Passo | null {
    return this.passos[0] ?? null;
  }

  achar(id: string | null | undefined): Passo | null {
    return (id ? this.porId.get(id) : null) ?? null;
  }

  escutar(listener: ConversaListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private avisar(change: ConversaChange): void {
    for (const listener of this.listeners) listener(change);
  }

  private novoId(): string {
    let id = `p${this.proximoId++}`;
    while (this.porId.has(id)) id = `p${this.proximoId++}`;
    return id;
  }

  /**
   * Acrescenta uma fala no fim. Se o ultimo passo era uma fala simples solta,
   * ele passa a apontar para a nova: quem escreve uma conversa escreve de
   * cima para baixo, e ligar na mao cada linha a seguinte seria trabalho de
   * digitacao, nao de autoria.
   */
  add(quem = '', texto = '', id?: string): Passo {
    const anterior = this.passos[this.passos.length - 1] ?? null;
    const passo: Passo = {
      id: id && !this.porId.has(id) ? id : this.novoId(),
      quem,
      texto,
      opcoes: [],
      proxima: null,
    };
    this.passos.push(passo);
    this.porId.set(passo.id, passo);

    if (anterior && anterior.opcoes.length === 0 && anterior.proxima === null) {
      anterior.proxima = passo.id;
      this.avisar({ kind: 'ligacao', id: anterior.id });
    }
    this.avisar({ kind: 'add', id: passo.id });
    return passo;
  }

  remove(id: string): boolean {
    const indice = this.passos.findIndex((passo) => passo.id === id);
    if (indice < 0) return false;
    this.passos.splice(indice, 1);
    this.porId.delete(id);

    // Quem apontava para ele fica apontando para o nada, e nao para um id
    // fantasma: uma conversa que termina e melhor que uma que trava.
    for (const passo of this.passos) {
      if (passo.proxima === id) {
        passo.proxima = null;
        this.avisar({ kind: 'ligacao', id: passo.id });
      }
      let mexeu = false;
      for (const opcao of passo.opcoes) {
        if (opcao.destino === id) {
          opcao.destino = null;
          mexeu = true;
        }
      }
      if (mexeu) this.avisar({ kind: 'opcoes', id: passo.id });
    }

    this.avisar({ kind: 'remove', id });
    return true;
  }

  setTexto(id: string, quem: string, texto: string): boolean {
    const passo = this.porId.get(id);
    if (!passo) return false;
    passo.quem = quem;
    passo.texto = texto;
    this.avisar({ kind: 'texto', id });
    return true;
  }

  /** Liga uma fala simples a proxima. Um id que nao existe vira `null`. */
  setProxima(id: string, proxima: string | null): boolean {
    const passo = this.porId.get(id);
    if (!passo) return false;
    passo.proxima = proxima && this.porId.has(proxima) ? proxima : null;
    this.avisar({ kind: 'ligacao', id });
    return true;
  }

  addOpcao(id: string, texto: string, destino: string | null = null): Opcao | null {
    const passo = this.porId.get(id);
    if (!passo) return null;
    const opcao: Opcao = { texto, destino: destino && this.porId.has(destino) ? destino : null };
    passo.opcoes.push(opcao);
    this.avisar({ kind: 'opcoes', id });
    return opcao;
  }

  setOpcao(id: string, indice: number, texto: string, destino: string | null): boolean {
    const passo = this.porId.get(id);
    const opcao = passo?.opcoes[indice];
    if (!passo || !opcao) return false;
    opcao.texto = texto;
    opcao.destino = destino && this.porId.has(destino) ? destino : null;
    this.avisar({ kind: 'opcoes', id });
    return true;
  }

  removeOpcao(id: string, indice: number): boolean {
    const passo = this.porId.get(id);
    if (!passo || indice < 0 || indice >= passo.opcoes.length) return false;
    passo.opcoes.splice(indice, 1);
    this.avisar({ kind: 'opcoes', id });
    return true;
  }

  renomear(name: string): void {
    this.name = name;
    this.avisar({ kind: 'nome' });
  }

  toData(): ConversaData {
    return {
      format: FORMAT_VERSION,
      name: this.name,
      passos: this.passos.map((passo) => ({
        ...passo,
        opcoes: passo.opcoes.map((opcao) => ({ ...opcao })),
      })),
    };
  }

  load(data: ConversaData): void {
    this.passos.length = 0;
    this.porId.clear();
    this.name = data.name;
    for (const passo of data.passos) {
      const copia: Passo = {
        id: passo.id,
        quem: passo.quem,
        texto: passo.texto,
        opcoes: passo.opcoes.map((opcao) => ({ ...opcao })),
        proxima: passo.proxima,
      };
      this.passos.push(copia);
      this.porId.set(copia.id, copia);
    }
    // Ligacoes para passos que nao vieram no arquivo terminam a conversa.
    for (const passo of this.passos) {
      if (passo.proxima !== null && !this.porId.has(passo.proxima)) passo.proxima = null;
      for (const opcao of passo.opcoes) {
        if (opcao.destino !== null && !this.porId.has(opcao.destino)) opcao.destino = null;
      }
    }
    this.proximoId = this.passos.length + 1;
    this.avisar({ kind: 'reload' });
  }

  static fromData(data: ConversaData): Conversa {
    const conversa = new Conversa(data.name);
    conversa.load(data);
    return conversa;
  }
}
