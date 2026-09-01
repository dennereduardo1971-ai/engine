/**
 * A arvore — a decisao mais importante do projeto (secao 7 do plano).
 *
 * Blocos e TypeScript nao sao dois sistemas que se convertem um no outro.
 * Sao duas visoes **desta** estrutura. O bloco desenha a arvore; o codigo
 * escreve a arvore; e nenhum dos dois e o original.
 *
 * Isso tem uma consequencia pratica que vale mais que a elegancia: nao existe
 * "conversao com perda". Um conversor de blocos para codigo teria que
 * adivinhar o que um comentario ou um espaco em branco viram do outro lado, e
 * um dia adivinharia errado — e a crianca perderia o que escreveu. Aqui nao
 * ha nada para perder: so ha uma arvore.
 *
 * Nenhum no tem identificador. Quem precisa apontar para um no usa o
 * **caminho** ate ele (a lista de indices desde a raiz). Caminho sobrevive a
 * ida e volta pelo codigo, e identificador nao sobreviveria: o texto do
 * codigo nao tem onde guardar um.
 */

export type Instrucao =
  | Quando
  | Fazer
  | Criar
  | Guardar
  | Se
  | Enquanto
  | Nota;

/**
 * Um recado de quem escreveu, para quem for ler depois.
 *
 * Ele existe na arvore, e nao so no texto, por causa da promessa da secao 7:
 * *nada se perde no caminho*. Um comentario que so morasse no codigo sumiria
 * na primeira ida e volta pelos blocos — e sumir sem avisar e a pior coisa que
 * um editor pode fazer com o que alguem escreveu.
 */
export interface Nota {
  tipo: 'nota';
  texto: string;
}

/** `on(Evento, (parametro) => { ... })` — o bloco-chapeu. */
export interface Quando {
  tipo: 'quando';
  evento: string;
  /** O que o evento entrega, se entregar alguma coisa. */
  parametro: string | null;
  corpo: Instrucao[];
}

/** Uma chamada como instrucao: `tocarSom("mola.ogg");` */
export interface Fazer {
  tipo: 'fazer';
  chamada: Chamada;
}

/** `let vidas = 3;` */
export interface Criar {
  tipo: 'criar';
  nome: string;
  valor: Expressao;
}

/** `vidas = vidas - 1;` */
export interface Guardar {
  tipo: 'guardar';
  nome: string;
  valor: Expressao;
}

/** `if (...) { ... } else { ... }` */
export interface Se {
  tipo: 'se';
  condicao: Expressao;
  entao: Instrucao[];
  senao: Instrucao[];
}

/** `while (...) { ... }` */
export interface Enquanto {
  tipo: 'enquanto';
  condicao: Expressao;
  corpo: Instrucao[];
}

export type Expressao =
  | Numero
  | Texto
  | Booleano
  | Nome
  | Chamada
  | Operacao
  | Oposto;

export interface Numero {
  tipo: 'numero';
  valor: number;
}

export interface Texto {
  tipo: 'texto';
  valor: string;
}

export interface Booleano {
  tipo: 'booleano';
  valor: boolean;
}

/** Uma variavel (`vidas`) ou uma constante (`CIMA`). */
export interface Nome {
  tipo: 'nome';
  nome: string;
}

export interface Chamada {
  tipo: 'chamada';
  nome: string;
  argumentos: Expressao[];
}

export type Operador =
  | '+' | '-' | '*' | '/' | '%'
  | '===' | '!==' | '<' | '<=' | '>' | '>='
  | '&&' | '||';

export interface Operacao {
  tipo: 'operacao';
  operador: Operador;
  esquerda: Expressao;
  direita: Expressao;
}

export interface Oposto {
  tipo: 'oposto';
  operador: '-' | '!';
  valor: Expressao;
}

/** Um script inteiro: um nome e uma lista de instrucoes no topo. */
export interface Script {
  nome: string;
  corpo: Instrucao[];
}

export function scriptVazio(nome = 'Script'): Script {
  return { nome, corpo: [] };
}

/**
 * Caminho ate um no: a lista de indices desde a raiz.
 *
 * `[0]` e a primeira instrucao do script; `[0, 2]` e a terceira instrucao
 * dentro dela; e assim por diante.
 */
export type Caminho = readonly number[];

/** Onde ficam os filhos de uma instrucao, e com que nome. */
export function ramos(instrucao: Instrucao): { rotulo: string; corpo: Instrucao[] }[] {
  switch (instrucao.tipo) {
    case 'quando':
      return [{ rotulo: 'corpo', corpo: instrucao.corpo }];
    case 'se':
      return [
        { rotulo: 'entao', corpo: instrucao.entao },
        { rotulo: 'senao', corpo: instrucao.senao },
      ];
    case 'enquanto':
      return [{ rotulo: 'corpo', corpo: instrucao.corpo }];
    default:
      return [];
  }
}

/**
 * A lista onde mora a instrucao apontada pelo caminho.
 *
 * Um caminho aponta para uma posicao dentro de uma lista. Devolver a lista e o
 * indice, em vez do no, e o que permite inserir, tirar e mover — que e o que o
 * editor de blocos precisa fazer.
 */
export function listaEm(
  corpo: Instrucao[],
  caminho: Caminho,
): { lista: Instrucao[]; indice: number } | null {
  if (caminho.length === 0) return null;
  let lista = corpo;
  for (let i = 0; i < caminho.length - 1; i++) {
    const instrucao = lista[caminho[i]];
    if (!instrucao) return null;
    const filhos = ramos(instrucao);
    if (filhos.length === 0) return null;
    // Ramos multiplos (o "senao" do se) vem no indice seguinte do caminho.
    if (filhos.length > 1) {
      const qual = caminho[++i];
      const ramo = filhos[qual];
      if (!ramo) return null;
      lista = ramo.corpo;
    } else {
      lista = filhos[0].corpo;
    }
  }
  return { lista, indice: caminho[caminho.length - 1] };
}

/** A instrucao apontada pelo caminho, ou null. */
export function instrucaoEm(corpo: Instrucao[], caminho: Caminho): Instrucao | null {
  const alvo = listaEm(corpo, caminho);
  return alvo ? (alvo.lista[alvo.indice] ?? null) : null;
}

/** Copia profunda de um script. O editor mexe em copias, e nunca no original. */
export function copiar<T>(valor: T): T {
  return structuredClone(valor);
}
