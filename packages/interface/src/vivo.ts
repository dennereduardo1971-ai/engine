/**
 * Campos vivos — amarrar um campo de um nó da tela a um valor do jogo.
 *
 * A fatia 3 deixou isto para depois: "ligar isto a um sistema de fase 'render'
 * fica para quando algum campo precisar de valor vivo a cada quadro (ex.: uma
 * barra amarrada à vida do personagem)". Hoje uma barra só muda quando alguém
 * chama `setFields` na mão; com uma ligação, ela muda sozinha, todo quadro.
 *
 * O que mora aqui é só a **conta**: uma lista de "este campo deste nó vale o
 * que esta função devolver", e um `atualizar()` que passa por ela. Quem chama
 * `atualizar()` a cada quadro é um sistema de fase `'render'` — e ele é criado
 * por quem já depende do runtime (o editor, um kit), não aqui:
 * `@faisca/interface` continua sem depender de `@faisca/runtime`, mesma
 * decisão da fatia 3. Em troca, isto é testável sem janela e sem laço de jogo.
 *
 * ```ts
 * const vivos = new CamposVivos(tela);
 * vivos.ligar(barra.id, 'valor', () => partida.vidas / 3);
 * engine.add(defineSystem({ name: 'TelaViva', phase: 'render', update: () => vivos.atualizar() }));
 * ```
 */

import { type UiDocument } from './documento.ts';

/** De onde vem o valor. Chamada uma vez por quadro, então mantenha barata. */
export type Fonte = () => number;

export interface Ligacao {
  id: string;
  campo: string;
  fonte: Fonte;
  /**
   * Arredonda o valor para múltiplos disto antes de escrever no documento.
   *
   * `0` escreve o valor cru. Um número maior que zero é o que segura o
   * conserto de estilo: uma barra amarrada ao relógio muda na sexta casa
   * decimal a cada quadro, e cada mudança dessas dispara um evento e refaz o
   * estilo do elemento à toa. `0.01` numa barra de 200px é meio pixel — a
   * pessoa não vê a diferença, e o navegador para de trabalhar de graça.
   */
  passo: number;
}

export class CamposVivos {
  /** A chave é `id\ncampo`: um nó pode ter vários campos vivos ao mesmo tempo. */
  private readonly ligacoes = new Map<string, Ligacao>();

  constructor(private readonly documento: UiDocument) {}

  get count(): number {
    return this.ligacoes.size;
  }

  get lista(): readonly Ligacao[] {
    return [...this.ligacoes.values()];
  }

  /** Amarra um campo. Ligar de novo o mesmo par troca a fonte, não empilha. */
  ligar(id: string, campo: string, fonte: Fonte, passo = 0): void {
    this.ligacoes.set(chave(id, campo), { id, campo, fonte, passo });
  }

  /** Solta um campo, ou todos os campos de um nó quando `campo` não vem. */
  desligar(id: string, campo?: string): void {
    if (campo !== undefined) {
      this.ligacoes.delete(chave(id, campo));
      return;
    }
    for (const ligacao of [...this.ligacoes.values()]) {
      if (ligacao.id === id) this.ligacoes.delete(chave(ligacao.id, ligacao.campo));
    }
  }

  limpar(): void {
    this.ligacoes.clear();
  }

  /**
   * Lê todas as fontes e escreve no documento. Uma vez por quadro.
   *
   * Um nó que sumiu da tela (a pessoa removeu o elemento com o jogo rodando)
   * some da lista junto, em vez de ficar chamando a fonte dele para sempre.
   * Valor que não é número não vai para o documento: uma fonte que devolveu
   * `NaN` deixa o campo como estava, e não apaga a barra da tela.
   */
  atualizar(): void {
    for (const ligacao of [...this.ligacoes.values()]) {
      if (!this.documento.get(ligacao.id)) {
        this.ligacoes.delete(chave(ligacao.id, ligacao.campo));
        continue;
      }
      const valor = ligacao.fonte();
      if (!Number.isFinite(valor)) continue;
      this.documento.setFields(ligacao.id, { [ligacao.campo]: arredondar(valor, ligacao.passo) });
    }
  }
}

function chave(id: string, campo: string): string {
  return `${id}\n${campo}`;
}

function arredondar(valor: number, passo: number): number {
  if (!(passo > 0)) return valor;
  return Math.round(valor / passo) * passo;
}
