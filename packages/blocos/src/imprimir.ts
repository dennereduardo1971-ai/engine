import {
  type Expressao,
  type Instrucao,
  type Operador,
  type Script,
} from './arvore.ts';

/**
 * A visao "codigo" da arvore.
 *
 * Ela e uma funcao pura: a mesma arvore sempre da o mesmo texto. Isso importa
 * mais do que parece — e o que permite guardar o script como texto num arquivo
 * `.ts`, ver o `git diff` dizendo "mudou a velocidade de 3 para 5", e ainda
 * assim ter a arvore de volta identica ao abrir.
 */

/** Forca de cada operador. Maior gruda mais. */
const FORCA: Record<Operador, number> = {
  '||': 1,
  '&&': 2,
  '===': 3,
  '!==': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

const FORCA_OPOSTO = 7;

export interface OpcoesDeImpressao {
  /** Espacos por nivel. Padrao 2. */
  recuo?: number;
}

/** Imprime o script inteiro. */
export function imprimir(script: Script, opcoes: OpcoesDeImpressao = {}): string {
  const recuo = ' '.repeat(opcoes.recuo ?? 2);
  const linhas = imprimirCorpo(script.corpo, 0, recuo);
  return linhas.length === 0 ? '' : `${linhas.join('\n')}\n`;
}

/** Imprime so uma instrucao, para o editor mostrar uma linha de cada vez. */
export function imprimirInstrucao(instrucao: Instrucao, opcoes: OpcoesDeImpressao = {}): string {
  return imprimirCorpo([instrucao], 0, ' '.repeat(opcoes.recuo ?? 2)).join('\n');
}

function imprimirCorpo(corpo: Instrucao[], nivel: number, recuo: string): string[] {
  const linhas: string[] = [];
  for (const instrucao of corpo) linhas.push(...imprimirUma(instrucao, nivel, recuo));
  return linhas;
}

function imprimirUma(instrucao: Instrucao, nivel: number, recuo: string): string[] {
  const espaco = recuo.repeat(nivel);
  switch (instrucao.tipo) {
    case 'quando': {
      const parametro = instrucao.parametro ?? '';
      return [
        `${espaco}on(${instrucao.evento}, (${parametro}) => {`,
        ...imprimirCorpo(instrucao.corpo, nivel + 1, recuo),
        `${espaco}});`,
      ];
    }
    case 'nota':
      return instrucao.texto
        .split('\n')
        .map((linha) => `${espaco}// ${linha}`.trimEnd());
    case 'fazer':
      return [`${espaco}${imprimirExpressao(instrucao.chamada, 0)};`];
    case 'criar':
      return [`${espaco}let ${instrucao.nome} = ${imprimirExpressao(instrucao.valor, 0)};`];
    case 'guardar':
      return [`${espaco}${instrucao.nome} = ${imprimirExpressao(instrucao.valor, 0)};`];
    case 'se': {
      const linhas = [
        `${espaco}if (${imprimirExpressao(instrucao.condicao, 0)}) {`,
        ...imprimirCorpo(instrucao.entao, nivel + 1, recuo),
      ];
      if (instrucao.senao.length > 0) {
        linhas.push(`${espaco}} else {`, ...imprimirCorpo(instrucao.senao, nivel + 1, recuo));
      }
      linhas.push(`${espaco}}`);
      return linhas;
    }
    case 'enquanto':
      return [
        `${espaco}while (${imprimirExpressao(instrucao.condicao, 0)}) {`,
        ...imprimirCorpo(instrucao.corpo, nivel + 1, recuo),
        `${espaco}}`,
      ];
  }
}

/**
 * Imprime uma expressao, pondo parenteses so onde eles mudam o sentido.
 *
 * `forcaDeFora` e a forca do operador que esta segurando esta expressao. Se
 * esta for mais fraca que aquela, ela precisa de parenteses para nao ser
 * puxada para dentro dele.
 */
export function imprimirExpressao(expressao: Expressao, forcaDeFora: number): string {
  switch (expressao.tipo) {
    case 'numero':
      return numeroEmTexto(expressao.valor);
    case 'texto':
      return textoEmCodigo(expressao.valor);
    case 'booleano':
      return expressao.valor ? 'true' : 'false';
    case 'nome':
      return expressao.nome;
    case 'chamada':
      return `${expressao.nome}(${expressao.argumentos
        .map((argumento) => imprimirExpressao(argumento, 0))
        .join(', ')})`;
    case 'oposto': {
      const dentro = imprimirExpressao(expressao.valor, FORCA_OPOSTO);
      const texto = `${expressao.operador}${dentro}`;
      return FORCA_OPOSTO < forcaDeFora ? `(${texto})` : texto;
    }
    case 'operacao': {
      const forca = FORCA[expressao.operador];
      const esquerda = imprimirExpressao(expressao.esquerda, forca);
      // A direita precisa de um degrau a mais: `a - (b - c)` nao e `a - b - c`.
      const direita = imprimirExpressao(expressao.direita, forca + 1);
      const texto = `${esquerda} ${expressao.operador} ${direita}`;
      return forca < forcaDeFora ? `(${texto})` : texto;
    }
  }
}

function numeroEmTexto(valor: number): string {
  if (Number.isNaN(valor)) return '0';
  if (!Number.isFinite(valor)) return valor > 0 ? '999999' : '-999999';
  // `-0` existe em JavaScript e imprime como "0"; guardar o sinal seria
  // guardar uma diferenca que ninguem consegue ver.
  return Object.is(valor, -0) ? '0' : String(valor);
}

/** Um texto do jeito que o TypeScript le de volta. */
export function textoEmCodigo(valor: string): string {
  const escapado = valor
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escapado}"`;
}
