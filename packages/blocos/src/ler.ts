import {
  type Expressao,
  type Instrucao,
  type Operador,
  type Script,
} from './arvore.ts';

/**
 * A visao "codigo" lida de volta: texto → arvore.
 *
 * Este leitor e escrito a mao, e nao emprestado do compilador do TypeScript,
 * por dois motivos. O primeiro e tamanho: o compilador inteiro pesa mais que a
 * engine toda, e o alvo e uma maquina de 8 GB. O segundo, e o que decide, e
 * que o plano pede **erros em portugues, com o bloco culpado destacado e uma
 * correcao sugerida** — e mensagem de erro boa nao se traduz de fora: ela
 * nasce de quem sabe o que estava esperando naquele ponto.
 *
 * A linguagem aceita e exatamente o que os blocos desenham. Nao e "TypeScript
 * com limitacoes": e a mesma arvore, escrita com as palavras do TypeScript.
 */

export interface ErroDeLeitura {
  mensagem: string;
  /** Linha, comecando em 1. */
  linha: number;
  /** Coluna, comecando em 1. */
  coluna: number;
  /** O que fazer para consertar, quando da para saber. */
  sugestao?: string;
}

export type Leitura =
  | { ok: true; script: Script }
  | { ok: false; erro: ErroDeLeitura };

// --- Fatiar o texto em pedacos ----------------------------------------------

type TipoDeFicha =
  | 'nome'
  | 'numero'
  | 'texto'
  | 'sinal'
  | 'comentario'
  | 'fim';

interface Ficha {
  tipo: TipoDeFicha;
  valor: string;
  linha: number;
  coluna: number;
}

const PALAVRAS = new Set(['let', 'if', 'else', 'while', 'true', 'false', 'on']);

const SINAIS = [
  '===', '!==', '=>', '&&', '||', '<=', '>=',
  '(', ')', '{', '}', ',', ';', '=', '<', '>', '+', '-', '*', '/', '%', '!',
];

class ErroDeSintaxe extends Error {
  constructor(readonly erro: ErroDeLeitura) {
    super(erro.mensagem);
  }
}

function fatiar(codigo: string): Ficha[] {
  const fichas: Ficha[] = [];
  let i = 0;
  let linha = 1;
  let coluna = 1;

  const avancar = (quantos = 1): void => {
    for (let k = 0; k < quantos; k++) {
      if (codigo[i] === '\n') {
        linha++;
        coluna = 1;
      } else {
        coluna++;
      }
      i++;
    }
  };

  while (i < codigo.length) {
    const c = codigo[i];

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      avancar();
      continue;
    }

    // Comentario de linha vira ficha, e nao lixo: ele tem lugar na arvore.
    if (c === '/' && codigo[i + 1] === '/') {
      const inicio = { linha, coluna };
      avancar(2);
      let texto = '';
      while (i < codigo.length && codigo[i] !== '\n') {
        texto += codigo[i];
        avancar();
      }
      fichas.push({ tipo: 'comentario', valor: texto.trim(), ...inicio });
      continue;
    }

    if (c === '/' && codigo[i + 1] === '*') {
      throw new ErroDeSintaxe({
        mensagem: 'Comentário de bloco (/* … */) ainda não cabe nos blocos.',
        linha,
        coluna,
        sugestao: 'Use // no começo de cada linha do recado.',
      });
    }

    if (c === '"' || c === "'") {
      const aspas = c;
      const inicio = { linha, coluna };
      avancar();
      let texto = '';
      while (i < codigo.length && codigo[i] !== aspas) {
        if (codigo[i] === '\n') {
          throw new ErroDeSintaxe({
            mensagem: 'Este texto começou e não terminou.',
            ...inicio,
            sugestao: `Feche o texto com ${aspas} antes do fim da linha.`,
          });
        }
        if (codigo[i] === '\\') {
          const seguinte = codigo[i + 1];
          const mapa: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" };
          texto += mapa[seguinte] ?? seguinte ?? '';
          avancar(2);
          continue;
        }
        texto += codigo[i];
        avancar();
      }
      if (i >= codigo.length) {
        throw new ErroDeSintaxe({
          mensagem: 'Este texto começou e não terminou.',
          ...inicio,
          sugestao: `Feche o texto com ${aspas}.`,
        });
      }
      avancar();
      fichas.push({ tipo: 'texto', valor: texto, ...inicio });
      continue;
    }

    if (c >= '0' && c <= '9') {
      const inicio = { linha, coluna };
      let numero = '';
      while (i < codigo.length && /[0-9._]/.test(codigo[i])) {
        if (codigo[i] !== '_') numero += codigo[i];
        avancar();
      }
      fichas.push({ tipo: 'numero', valor: numero, ...inicio });
      continue;
    }

    if (/[A-Za-zÀ-ÿ_$]/.test(c)) {
      const inicio = { linha, coluna };
      let nome = '';
      while (i < codigo.length && /[A-Za-zÀ-ÿ0-9_$]/.test(codigo[i])) {
        nome += codigo[i];
        avancar();
      }
      fichas.push({ tipo: 'nome', valor: nome, ...inicio });
      continue;
    }

    const sinal = SINAIS.find((candidato) => codigo.startsWith(candidato, i));
    if (sinal) {
      fichas.push({ tipo: 'sinal', valor: sinal, linha, coluna });
      avancar(sinal.length);
      continue;
    }

    throw new ErroDeSintaxe({
      mensagem: `Não entendi o símbolo "${c}".`,
      linha,
      coluna,
    });
  }

  fichas.push({ tipo: 'fim', valor: '', linha, coluna });
  return fichas;
}

// --- Montar a arvore ---------------------------------------------------------

class Leitor {
  private posicao = 0;

  constructor(private readonly fichas: Ficha[]) {}

  private get atual(): Ficha {
    return this.fichas[this.posicao];
  }

  private avancar(): Ficha {
    return this.fichas[this.posicao++];
  }

  private ehSinal(valor: string): boolean {
    return this.atual.tipo === 'sinal' && this.atual.valor === valor;
  }

  private ehPalavra(valor: string): boolean {
    return this.atual.tipo === 'nome' && this.atual.valor === valor;
  }

  private aceitarSinal(valor: string): boolean {
    if (!this.ehSinal(valor)) return false;
    this.avancar();
    return true;
  }

  private exigirSinal(valor: string, oQueEra: string): Ficha {
    if (!this.ehSinal(valor)) {
      throw new ErroDeSintaxe({
        mensagem: `Faltou "${valor}" ${oQueEra}.`,
        linha: this.atual.linha,
        coluna: this.atual.coluna,
        sugestao: this.atual.tipo === 'fim' ? 'O arquivo terminou antes da hora.' : undefined,
      });
    }
    return this.avancar();
  }

  private exigirNome(oQueEra: string): Ficha {
    if (this.atual.tipo !== 'nome') {
      throw new ErroDeSintaxe({
        mensagem: `Esperava ${oQueEra} aqui.`,
        linha: this.atual.linha,
        coluna: this.atual.coluna,
      });
    }
    return this.avancar();
  }

  lerPrograma(): Instrucao[] {
    const corpo: Instrucao[] = [];
    while (this.atual.tipo !== 'fim') corpo.push(this.lerInstrucao());
    return corpo;
  }

  private lerBloco(oQueEra: string): Instrucao[] {
    this.exigirSinal('{', `para abrir ${oQueEra}`);
    const corpo: Instrucao[] = [];
    while (!this.ehSinal('}')) {
      if (this.atual.tipo === 'fim') {
        throw new ErroDeSintaxe({
          mensagem: `Faltou "}" para fechar ${oQueEra}.`,
          linha: this.atual.linha,
          coluna: this.atual.coluna,
        });
      }
      corpo.push(this.lerInstrucao());
    }
    this.avancar();
    return corpo;
  }

  private lerInstrucao(): Instrucao {
    const ficha = this.atual;

    if (ficha.tipo === 'comentario') {
      this.avancar();
      return { tipo: 'nota', texto: ficha.valor };
    }

    if (this.ehPalavra('on')) return this.lerQuando();
    if (this.ehPalavra('let')) return this.lerCriar();
    if (this.ehPalavra('if')) return this.lerSe();
    if (this.ehPalavra('while')) return this.lerEnquanto();

    if (this.ehPalavra('else')) {
      throw new ErroDeSintaxe({
        mensagem: 'Este "senão" está solto: não há um "se" antes dele.',
        linha: ficha.linha,
        coluna: ficha.coluna,
      });
    }

    if (ficha.tipo === 'nome') {
      // `nome = valor;` ou `nome(...);`
      const seguinte = this.fichas[this.posicao + 1];
      if (seguinte?.tipo === 'sinal' && seguinte.valor === '=') {
        this.avancar();
        this.avancar();
        const valor = this.lerExpressao();
        this.exigirSinal(';', 'no fim da linha');
        return { tipo: 'guardar', nome: ficha.valor, valor };
      }
      const expressao = this.lerExpressao();
      this.exigirSinal(';', 'no fim da linha');
      if (expressao.tipo !== 'chamada') {
        throw new ErroDeSintaxe({
          mensagem: 'Esta linha não faz nada.',
          linha: ficha.linha,
          coluna: ficha.coluna,
          sugestao: 'Um bloco solto precisa ser uma ação, como mover(0, 0, 1).',
        });
      }
      return { tipo: 'fazer', chamada: expressao };
    }

    throw new ErroDeSintaxe({
      mensagem: `Não esperava "${ficha.valor || 'o fim do arquivo'}" aqui.`,
      linha: ficha.linha,
      coluna: ficha.coluna,
    });
  }

  private lerQuando(): Instrucao {
    this.avancar(); // on
    this.exigirSinal('(', 'depois de "on"');
    const evento = this.exigirNome('o nome de um evento');
    this.exigirSinal(',', 'depois do nome do evento');
    this.exigirSinal('(', 'para abrir o que o evento entrega');
    let parametro: string | null = null;
    if (this.atual.tipo === 'nome') parametro = this.avancar().valor;
    this.exigirSinal(')', 'para fechar o que o evento entrega');
    this.exigirSinal('=>', 'entre o evento e o que ele faz');
    const corpo = this.lerBloco('o que o evento faz');
    this.exigirSinal(')', 'para fechar o "on"');
    this.exigirSinal(';', 'no fim do "on"');
    return { tipo: 'quando', evento: evento.valor, parametro, corpo };
  }

  private lerCriar(): Instrucao {
    this.avancar(); // let
    const nome = this.exigirNome('o nome da caixinha');
    this.exigirSinal('=', 'depois do nome');
    const valor = this.lerExpressao();
    this.exigirSinal(';', 'no fim da linha');
    return { tipo: 'criar', nome: nome.valor, valor };
  }

  private lerSe(): Instrucao {
    this.avancar(); // if
    this.exigirSinal('(', 'depois de "if"');
    const condicao = this.lerExpressao();
    this.exigirSinal(')', 'para fechar a pergunta do "if"');
    const entao = this.lerBloco('o que fazer quando for verdade');
    let senao: Instrucao[] = [];
    if (this.ehPalavra('else')) {
      this.avancar();
      senao = this.lerBloco('o que fazer quando não for');
    }
    return { tipo: 'se', condicao, entao, senao };
  }

  private lerEnquanto(): Instrucao {
    this.avancar(); // while
    this.exigirSinal('(', 'depois de "while"');
    const condicao = this.lerExpressao();
    this.exigirSinal(')', 'para fechar a pergunta do "while"');
    const corpo = this.lerBloco('o que repetir');
    return { tipo: 'enquanto', condicao, corpo };
  }

  // --- Expressoes, da mais fraca para a mais forte --------------------------

  lerExpressao(): Expressao {
    return this.lerOu();
  }

  private lerEmNivel(
    operadores: readonly Operador[],
    proximo: () => Expressao,
  ): Expressao {
    let esquerda = proximo();
    for (;;) {
      const ficha = this.atual;
      if (ficha.tipo !== 'sinal') break;
      const operador = operadores.find((candidato) => candidato === ficha.valor);
      if (!operador) break;
      this.avancar();
      const direita = proximo();
      esquerda = { tipo: 'operacao', operador, esquerda, direita };
    }
    return esquerda;
  }

  private lerOu(): Expressao {
    return this.lerEmNivel(['||'], () => this.lerE());
  }

  private lerE(): Expressao {
    return this.lerEmNivel(['&&'], () => this.lerIgualdade());
  }

  private lerIgualdade(): Expressao {
    return this.lerEmNivel(['===', '!=='], () => this.lerComparacao());
  }

  private lerComparacao(): Expressao {
    return this.lerEmNivel(['<', '<=', '>', '>='], () => this.lerSoma());
  }

  private lerSoma(): Expressao {
    return this.lerEmNivel(['+', '-'], () => this.lerProduto());
  }

  private lerProduto(): Expressao {
    return this.lerEmNivel(['*', '/', '%'], () => this.lerOposto());
  }

  private lerOposto(): Expressao {
    if (this.ehSinal('-') || this.ehSinal('!')) {
      const operador = this.avancar().valor as '-' | '!';
      return { tipo: 'oposto', operador, valor: this.lerOposto() };
    }
    return this.lerPrimario();
  }

  private lerPrimario(): Expressao {
    const ficha = this.atual;

    if (ficha.tipo === 'numero') {
      this.avancar();
      const valor = Number(ficha.valor);
      if (Number.isNaN(valor)) {
        throw new ErroDeSintaxe({
          mensagem: `"${ficha.valor}" não é um número que eu entenda.`,
          linha: ficha.linha,
          coluna: ficha.coluna,
        });
      }
      return { tipo: 'numero', valor };
    }

    if (ficha.tipo === 'texto') {
      this.avancar();
      return { tipo: 'texto', valor: ficha.valor };
    }

    if (this.aceitarSinal('(')) {
      const dentro = this.lerExpressao();
      this.exigirSinal(')', 'para fechar o parêntese');
      return dentro;
    }

    if (ficha.tipo === 'nome') {
      if (ficha.valor === 'true' || ficha.valor === 'false') {
        this.avancar();
        return { tipo: 'booleano', valor: ficha.valor === 'true' };
      }
      if (PALAVRAS.has(ficha.valor)) {
        throw new ErroDeSintaxe({
          mensagem: `"${ficha.valor}" é uma palavra reservada e não pode ser usada aqui.`,
          linha: ficha.linha,
          coluna: ficha.coluna,
        });
      }
      this.avancar();
      if (this.aceitarSinal('(')) {
        const argumentos: Expressao[] = [];
        if (!this.ehSinal(')')) {
          do {
            argumentos.push(this.lerExpressao());
          } while (this.aceitarSinal(','));
        }
        this.exigirSinal(')', `para fechar a chamada de "${ficha.valor}"`);
        return { tipo: 'chamada', nome: ficha.valor, argumentos };
      }
      return { tipo: 'nome', nome: ficha.valor };
    }

    throw new ErroDeSintaxe({
      mensagem:
        ficha.tipo === 'fim'
          ? 'O arquivo terminou no meio de uma conta.'
          : `Esperava um valor, e achei "${ficha.valor}".`,
      linha: ficha.linha,
      coluna: ficha.coluna,
    });
  }
}

/** Le o codigo e devolve a arvore, ou o primeiro erro, em portugues. */
export function ler(codigo: string, nome = 'Script'): Leitura {
  try {
    const leitor = new Leitor(fatiar(codigo));
    return { ok: true, script: { nome, corpo: leitor.lerPrograma() } };
  } catch (erro) {
    if (erro instanceof ErroDeSintaxe) return { ok: false, erro: erro.erro };
    throw erro;
  }
}
