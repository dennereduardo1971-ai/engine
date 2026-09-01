import {
  type Expressao,
  type Instrucao,
  type Quando,
  type Script,
} from './arvore.ts';

/**
 * O interpretador — a arvore rodando.
 *
 * Ele anda pela mesma arvore que os blocos desenham. Nao ha compilacao, nem
 * `eval`, nem uma terceira representacao no meio: o que a crianca ve e o que
 * roda. Isso tambem e o que permite parar no meio e apontar o bloco que deu
 * errado.
 *
 * Nao usar `eval` nao e purismo: um jogo publicado nao pode executar texto
 * arbitrario, e um jogo da familia muito menos.
 */

export type Valor = number | string | boolean;

export interface ErroDeExecucao {
  mensagem: string;
  sugestao?: string;
}

/** O que o mundo oferece ao script: os blocos que fazem alguma coisa. */
export interface Ambiente {
  chamar(nome: string, argumentos: Valor[]): Valor | void;
  /** Constantes do jogo (CIMA, BAIXO). Opcional. */
  constante?(nome: string): Valor | undefined;
}

export interface OpcoesDeExecucao {
  /**
   * Teto de passos por disparo.
   *
   * Existe porque `while (true) {}` e uma das primeiras coisas que alguem
   * escreve sem querer, e sem teto isso trava a aba — a crianca perde o que
   * fez e nao entende por que. Com teto, ela ganha uma frase explicando.
   */
  maxPassos?: number;
}

class ParouAqui extends Error {
  constructor(readonly erro: ErroDeExecucao) {
    super(erro.mensagem);
  }
}

const MAX_PASSOS = 200_000;

/**
 * Um script vivo, ligado a um objeto do jogo.
 *
 * As caixinhas (`let`) criadas fora dos eventos vivem aqui, e continuam
 * valendo de um evento para o outro — e o que faz "contar quantas vezes o
 * jogador passou" ser possivel sem explicar escopo para ninguem.
 */
export class Instancia {
  private readonly memoria = new Map<string, Valor>();
  private readonly maxPassos: number;
  private passos = 0;

  constructor(
    readonly script: Script,
    private readonly ambiente: Ambiente,
    opcoes: OpcoesDeExecucao = {},
  ) {
    this.maxPassos = opcoes.maxPassos ?? MAX_PASSOS;
  }

  /** Os blocos "quando" de um evento. */
  ouvintes(evento: string): Quando[] {
    return this.script.corpo.filter(
      (instrucao): instrucao is Quando =>
        instrucao.tipo === 'quando' && instrucao.evento === evento,
    );
  }

  /** Roda o que esta fora dos eventos. Uma vez, no comeco. */
  iniciar(): ErroDeExecucao | null {
    const soltas = this.script.corpo.filter((instrucao) => instrucao.tipo !== 'quando');
    return this.rodar(soltas, new Map());
  }

  /** Dispara um evento. `entrega` e o que o evento passa para dentro. */
  disparar(evento: string, entrega?: Valor): ErroDeExecucao | null {
    for (const ouvinte of this.ouvintes(evento)) {
      const local = new Map<string, Valor>();
      if (ouvinte.parametro && entrega !== undefined) local.set(ouvinte.parametro, entrega);
      const erro = this.rodar(ouvinte.corpo, local);
      if (erro) return erro;
    }
    return null;
  }

  /** O valor de uma caixinha, para o console ao vivo do editor. */
  ver(nome: string): Valor | undefined {
    return this.memoria.get(nome);
  }

  private rodar(corpo: Instrucao[], local: Map<string, Valor>): ErroDeExecucao | null {
    this.passos = 0;
    try {
      this.executar(corpo, local);
      return null;
    } catch (erro) {
      if (erro instanceof ParouAqui) return erro.erro;
      return { mensagem: erro instanceof Error ? erro.message : 'Deu errado.' };
    }
  }

  private gastarPasso(): void {
    if (++this.passos > this.maxPassos) {
      throw new ParouAqui({
        mensagem: 'Este script está rodando sem parar.',
        sugestao:
          'Um "enquanto" precisa de algo que faça a pergunta virar falsa em algum momento.',
      });
    }
  }

  private executar(corpo: Instrucao[], local: Map<string, Valor>): void {
    for (const instrucao of corpo) {
      this.gastarPasso();
      switch (instrucao.tipo) {
        case 'nota':
        case 'quando':
          break;

        case 'fazer':
          this.avaliar(instrucao.chamada, local);
          break;

        case 'criar':
          local.set(instrucao.nome, this.avaliar(instrucao.valor, local));
          this.memoria.set(instrucao.nome, local.get(instrucao.nome) as Valor);
          break;

        case 'guardar': {
          const valor = this.avaliar(instrucao.valor, local);
          if (local.has(instrucao.nome)) local.set(instrucao.nome, valor);
          this.memoria.set(instrucao.nome, valor);
          break;
        }

        case 'se':
          if (verdadeiro(this.avaliar(instrucao.condicao, local))) {
            this.executar(instrucao.entao, local);
          } else {
            this.executar(instrucao.senao, local);
          }
          break;

        case 'enquanto':
          while (verdadeiro(this.avaliar(instrucao.condicao, local))) {
            this.gastarPasso();
            this.executar(instrucao.corpo, local);
          }
          break;
      }
    }
  }

  private avaliar(expressao: Expressao, local: Map<string, Valor>): Valor {
    this.gastarPasso();
    switch (expressao.tipo) {
      case 'numero':
      case 'texto':
      case 'booleano':
        return expressao.valor;

      case 'nome': {
        if (local.has(expressao.nome)) return local.get(expressao.nome) as Valor;
        if (this.memoria.has(expressao.nome)) return this.memoria.get(expressao.nome) as Valor;
        const constante = this.ambiente.constante?.(expressao.nome);
        if (constante !== undefined) return constante;
        throw new ParouAqui({
          mensagem: `Não sei o que é "${expressao.nome}".`,
          sugestao: `Crie antes com: let ${expressao.nome} = 0;`,
        });
      }

      case 'chamada': {
        const argumentos = expressao.argumentos.map((argumento) => this.avaliar(argumento, local));
        const saida = this.ambiente.chamar(expressao.nome, argumentos);
        return saida === undefined ? 0 : saida;
      }

      case 'oposto': {
        const valor = this.avaliar(expressao.valor, local);
        return expressao.operador === '-' ? -numero(valor) : !verdadeiro(valor);
      }

      case 'operacao': {
        const esquerda = this.avaliar(expressao.esquerda, local);
        // "e" e "ou" param no meio se ja souberem a resposta.
        if (expressao.operador === '&&') {
          return verdadeiro(esquerda) ? this.avaliar(expressao.direita, local) : esquerda;
        }
        if (expressao.operador === '||') {
          return verdadeiro(esquerda) ? esquerda : this.avaliar(expressao.direita, local);
        }
        const direita = this.avaliar(expressao.direita, local);
        switch (expressao.operador) {
          case '+':
            // Somar texto junta; somar numero conta. E o que qualquer um espera.
            return typeof esquerda === 'string' || typeof direita === 'string'
              ? `${texto(esquerda)}${texto(direita)}`
              : numero(esquerda) + numero(direita);
          case '-':
            return numero(esquerda) - numero(direita);
          case '*':
            return numero(esquerda) * numero(direita);
          case '/': {
            const divisor = numero(direita);
            if (divisor === 0) {
              throw new ParouAqui({
                mensagem: 'Não dá para dividir por zero.',
                sugestao: 'Confira o valor de baixo da divisão antes de dividir.',
              });
            }
            return numero(esquerda) / divisor;
          }
          case '%': {
            const divisor = numero(direita);
            if (divisor === 0) {
              throw new ParouAqui({ mensagem: 'Não dá para dividir por zero.' });
            }
            return numero(esquerda) % divisor;
          }
          case '===':
            return esquerda === direita;
          case '!==':
            return esquerda !== direita;
          case '<':
            return numero(esquerda) < numero(direita);
          case '<=':
            return numero(esquerda) <= numero(direita);
          case '>':
            return numero(esquerda) > numero(direita);
          case '>=':
            return numero(esquerda) >= numero(direita);
        }
      }
    }
  }
}

function verdadeiro(valor: Valor): boolean {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor !== 0;
  return valor.length > 0;
}

function numero(valor: Valor): number {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  const convertido = Number(valor);
  return Number.isNaN(convertido) ? 0 : convertido;
}

function texto(valor: Valor): string {
  return typeof valor === 'string' ? valor : String(valor);
}
