import {
  copiar,
  instrucaoEm,
  listaEm,
  type Caminho,
  type Expressao,
  type Fazer,
  type Instrucao,
  type Quando,
  type Script,
} from './arvore.ts';
import { acharBloco, acharEvento } from './catalogo.ts';

/**
 * Regras — gatilho e resposta, a terceira visao da mesma arvore.
 *
 * A secao 7 do plano pede "quando o jogador entra aqui → abre a porta e toca
 * som, montado so apontando e clicando", e chama isso de coracao do perfil
 * Design. A tentacao seria guardar essas regras num formato proprio, com um
 * conversor para blocos. Seria o mesmo erro que a secao 7 manda nao cometer,
 * so que uma camada acima: um dia o conversor adivinharia errado, e a mae
 * perderia o que montou.
 *
 * Entao **regra nao e um formato**: e uma *leitura* da arvore. Uma regra e um
 * bloco `quando` cujo corpo e uma pilha de acoes simples, e uma acao e uma
 * chamada de bloco com valores digitados. Nada mais, nada menos.
 *
 * Duas consequencias praticas, e sao elas que justificam o desenho:
 *
 * 1. **A mesma peca abre nas tres visoes.** A regra montada apontando e
 *    clicando aparece como bloco no perfil Criador e como codigo no perfil
 *    Programador, sem conversao nenhuma no caminho.
 * 2. **O que a regra nao sabe desenhar, ela nao apaga.** Um `se`, um
 *    `enquanto` ou uma conta dentro de um bloco ficam de fora da tela de
 *    regras — e continuam intactos na arvore, porque toda edicao daqui e
 *    cirurgica: mexe no no apontado pelo caminho, e no resto nao toca.
 */

/** O que cabe num buraco de regra: valor digitado, e nunca uma conta. */
export type ValorDeRegra = number | string | boolean;

export interface AcaoDeRegra {
  /** Nome do bloco chamado. */
  bloco: string;
  argumentos: ValorDeRegra[];
  /** Onde ela mora na arvore — e por aqui que a edicao acha o no. */
  caminho: Caminho;
}

export interface Regra {
  evento: string;
  acoes: AcaoDeRegra[];
  caminho: Caminho;
  /**
   * Quantas instrucoes do corpo desta regra a visao nao sabe desenhar.
   *
   * O painel avisa em vez de esconder calado: quem montou a regra precisa
   * saber que aquela peca faz mais coisas do que a tela esta mostrando.
   */
  escondidas: number;
}

export interface VistaDeRegras {
  regras: Regra[];
  /** Instrucoes fora de qualquer regra que a visao nao desenha. */
  escondidas: number;
}

/** Le a arvore como regras. O que nao couber e contado, e nunca descartado. */
export function regrasDe(script: Script): VistaDeRegras {
  const regras: Regra[] = [];
  let escondidas = 0;

  script.corpo.forEach((instrucao, indice) => {
    if (instrucao.tipo !== 'quando') {
      escondidas++;
      return;
    }
    regras.push(lerRegra(instrucao, [indice]));
  });

  return { regras, escondidas };
}

function lerRegra(quando: Quando, caminho: Caminho): Regra {
  const acoes: AcaoDeRegra[] = [];
  let escondidas = 0;

  quando.corpo.forEach((instrucao, indice) => {
    const acao = lerAcao(instrucao, [...caminho, indice]);
    if (acao) acoes.push(acao);
    else escondidas++;
  });

  return { evento: quando.evento, acoes, caminho, escondidas };
}

function lerAcao(instrucao: Instrucao, caminho: Caminho): AcaoDeRegra | null {
  if (instrucao.tipo !== 'fazer') return null;
  const argumentos: ValorDeRegra[] = [];
  for (const argumento of instrucao.chamada.argumentos) {
    const valor = literal(argumento);
    // Um argumento so, se for uma conta, ja tira a acao inteira da tela de
    // regras: mostrar "empurrar o jogador para cima ?" seria pior do que
    // dizer que ha uma acao que so aparece em blocos.
    if (valor === null) return null;
    argumentos.push(valor);
  }
  return { bloco: instrucao.chamada.nome, argumentos, caminho };
}

function literal(expressao: Expressao): ValorDeRegra | null {
  switch (expressao.tipo) {
    case 'numero':
    case 'texto':
    case 'booleano':
      return expressao.valor;

    /**
     * Um menos na frente de um numero ainda e um numero.
     *
     * Na arvore ele e um `oposto`, porque e assim que o leitor de codigo ve
     * `girar(-45)` — a linguagem nao tem numero negativo, tem menos aplicado a
     * um numero. Recusar isso aqui faria uma regra perfeitamente montavel
     * ("girar -45 graus") sumir da tela de regras so por causa de um sinal, e
     * o pior e que ela sumiria *depois* de alguem digitar o valor no campo e
     * dar a volta pelo codigo.
     */
    case 'oposto': {
      const dentro = literal(expressao.valor);
      if (expressao.operador === '-' && typeof dentro === 'number') return -dentro;
      if (expressao.operador === '!' && typeof dentro === 'boolean') return !dentro;
      return null;
    }

    default:
      return null;
  }
}

/** A arvore inteira cabe na tela de regras? */
export function cabeEmRegras(script: Script): boolean {
  const vista = regrasDe(script);
  return vista.escondidas === 0 && vista.regras.every((regra) => regra.escondidas === 0);
}

// --- Construir ---------------------------------------------------------------

/** Um `quando` vazio, com o parametro que o evento entrega. */
export function novaRegra(evento: string): Quando {
  return {
    tipo: 'quando',
    evento,
    parametro: acharEvento(evento)?.parametro ?? null,
    corpo: [],
  };
}

/** Uma acao com os valores de fabrica do bloco ja preenchidos. */
export function novaAcao(bloco: string): Fazer {
  const definicao = acharBloco(bloco);
  return {
    tipo: 'fazer',
    chamada: {
      tipo: 'chamada',
      nome: bloco,
      argumentos: definicao ? definicao.parametros.map((parametro) => copiar(parametro.padrao)) : [],
    },
  };
}

/**
 * Regras viram arvore.
 *
 * Serve para montar um script do zero e, principalmente, para provar a ida e
 * volta: ler uma arvore como regras e escrever as regras de volta tem que dar
 * a mesma arvore, ou a visao esta mentindo sobre o que mostra.
 */
export function scriptDeRegras(regras: readonly Regra[], nome = 'Script'): Script {
  return {
    nome,
    corpo: regras.map((regra) => {
      const quando = novaRegra(regra.evento);
      quando.corpo = regra.acoes.map((acao) => ({
        tipo: 'fazer',
        chamada: {
          tipo: 'chamada',
          nome: acao.bloco,
          argumentos: acao.argumentos.map(expressaoDe),
        },
      }));
      return quando;
    }),
  };
}

function expressaoDe(valor: ValorDeRegra): Expressao {
  if (typeof valor === 'number') return { tipo: 'numero', valor };
  if (typeof valor === 'boolean') return { tipo: 'booleano', valor };
  return { tipo: 'texto', valor };
}

// --- Editar ------------------------------------------------------------------
//
// Toda funcao daqui devolve um script novo e nao mexe no que recebeu. E o que
// deixa o desfazer do editor funcionar sem nenhum cuidado especial: cada
// mexida e um estado inteiro, e nao um remendo no estado anterior.

/** Poe uma regra no fim do script. */
export function porRegra(script: Script, evento: string): Script {
  const novo = copiar(script);
  novo.corpo.push(novaRegra(evento));
  return novo;
}

/** Tira a regra (ou a acao) apontada pelo caminho. */
export function tirar(script: Script, caminho: Caminho): Script {
  const novo = copiar(script);
  const alvo = listaEm(novo.corpo, caminho);
  if (alvo && alvo.lista[alvo.indice]) alvo.lista.splice(alvo.indice, 1);
  return novo;
}

/** Poe uma acao no fim de uma regra. */
export function porAcao(script: Script, regra: Caminho, bloco: string): Script {
  const novo = copiar(script);
  const alvo = instrucaoEm(novo.corpo, regra);
  if (alvo?.tipo === 'quando') alvo.corpo.push(novaAcao(bloco));
  return novo;
}

/** Sobe (-1) ou desce (1) a acao apontada pelo caminho, dentro da regra dela. */
export function moverAcao(script: Script, caminho: Caminho, passo: number): Script {
  const novo = copiar(script);
  const alvo = listaEm(novo.corpo, caminho);
  if (!alvo) return novo;
  const destino = alvo.indice + passo;
  if (destino < 0 || destino >= alvo.lista.length) return novo;
  const [tirada] = alvo.lista.splice(alvo.indice, 1);
  alvo.lista.splice(destino, 0, tirada);
  return novo;
}

/**
 * Troca um valor digitado dentro de uma acao.
 *
 * Se o buraco guardava uma conta, ela e substituida pelo valor — e por isso a
 * tela de regras nunca mostra um buraco com conta dentro: sem ver o que ha
 * ali, ninguem pode apagar sem querer.
 */
export function trocarValor(
  script: Script,
  caminho: Caminho,
  indice: number,
  valor: ValorDeRegra,
): Script {
  const novo = copiar(script);
  const alvo = instrucaoEm(novo.corpo, caminho);
  if (alvo?.tipo === 'fazer' && indice >= 0 && indice < alvo.chamada.argumentos.length) {
    alvo.chamada.argumentos[indice] = expressaoDe(valor);
  }
  return novo;
}

/** Troca o evento de uma regra, mantendo as acoes que ja estao dentro dela. */
export function trocarEvento(script: Script, caminho: Caminho, evento: string): Script {
  const novo = copiar(script);
  const alvo = instrucaoEm(novo.corpo, caminho);
  if (alvo?.tipo === 'quando') {
    alvo.evento = evento;
    alvo.parametro = acharEvento(evento)?.parametro ?? null;
  }
  return novo;
}
