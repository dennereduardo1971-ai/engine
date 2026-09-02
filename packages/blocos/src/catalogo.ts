import { type Expressao } from './arvore.ts';

/**
 * O catalogo — quais blocos existem.
 *
 * Ele e a mesma lista para as duas visoes: e daqui que sai a gaveta de blocos
 * do editor **e** a lista de funcoes que o codigo pode chamar. Um bloco que
 * nao esta aqui nao existe em nenhuma das duas, e por isso as duas nunca
 * discordam.
 *
 * O nome no codigo e em ingles? Nao: aqui e em portugues, dos dois lados. A
 * regra de "ingles no codigo" da secao 6 vale para o codigo da *engine*, que e
 * escrito por quem programa. Isto e o codigo do *jogo*, escrito pela familia —
 * e obrigar a mae a escrever `playSound` para ouvir um som seria trocar o
 * problema de lugar.
 */

/**
 * O tipo de um buraco de bloco.
 *
 * `peca` e `som` sao texto por baixo — o interpretador e o conferidor nem
 * sabem que eles existem. Eles moram aqui porque a *interface* precisa saber:
 * um buraco de peca vira uma lista das pecas da fase, e um de som vira a
 * lista dos sons que a engine tem. E o que faz o perfil Design da secao 8 ser
 * possivel sem digitar nada — ninguem escreve "Porta" de cabeca e acerta.
 */
export type TipoDeValor = 'numero' | 'texto' | 'booleano' | 'peca' | 'som' | 'qualquer';

export interface Parametro {
  nome: string;
  /** Palavra que aparece antes do buraco no bloco. Pode ser vazia. */
  rotulo: string;
  tipo: TipoDeValor;
  padrao: Expressao;
}

export type Categoria = 'movimento' | 'cena' | 'jogo' | 'valores' | 'controle';

export interface BlocoDefinicao {
  /** Nome chamado no codigo. */
  nome: string;
  /**
   * A forma do bloco, com buracos: `mover {x} {y} {z}`.
   * E isto que o editor desenha, e e por isso que um bloco le como uma frase.
   */
  forma: string;
  categoria: Categoria;
  parametros: Parametro[];
  /** Devolve valor? Entao ele e um bloco de encaixar, e nao de empilhar. */
  devolve: TipoDeValor | null;
  ajuda: string;
}

export interface EventoDefinicao {
  nome: string;
  /** Como o chapeu do bloco e lido. */
  forma: string;
  /** O que o evento entrega para dentro do bloco. */
  parametro: string | null;
  ajuda: string;
}

const numero = (valor: number): Expressao => ({ tipo: 'numero', valor });
const texto = (valor: string): Expressao => ({ tipo: 'texto', valor });

export const EVENTOS: readonly EventoDefinicao[] = [
  {
    nome: 'AoComecar',
    forma: 'quando a fase começa',
    parametro: null,
    ajuda: 'Roda uma vez, no instante em que você aperta Jogar.',
  },
  {
    nome: 'ACadaQuadro',
    forma: 'a cada quadro',
    parametro: null,
    ajuda: 'Roda o tempo todo, sessenta vezes por segundo. Cuidado com o que você põe aqui.',
  },
  {
    // O nome no codigo continua "AoEncostar", e a forma lida virou "chegar
    // aqui". A secao 7 do plano escreve a regra-modelo como "quando o jogador
    // entra aqui", e "aqui" e a palavra certa: ela serve tanto para um bloco
    // quanto para uma Area, que e uma regiao inteira do mapa. Trocar o nome no
    // codigo junto quebraria toda cena ja salva, e sem ganho nenhum.
    nome: 'AoEncostar',
    forma: 'quando o jogador chegar aqui',
    parametro: 'jogador',
    ajuda: 'Roda quando o personagem entra no espaço desta peça.',
  },
  {
    nome: 'AoSair',
    forma: 'quando o jogador sair daqui',
    parametro: 'jogador',
    ajuda:
      'Roda quando o personagem se afasta desta peça. É o par de "chegar aqui": ' +
      'com os dois, uma porta abre na entrada e fecha na saída.',
  },
];

export const BLOCOS: readonly BlocoDefinicao[] = [
  // --- Movimento ------------------------------------------------------------
  {
    nome: 'mover',
    forma: 'mover {x} {y} {z}',
    categoria: 'movimento',
    parametros: [
      { nome: 'x', rotulo: 'x', tipo: 'numero', padrao: numero(0) },
      { nome: 'y', rotulo: 'y', tipo: 'numero', padrao: numero(0) },
      { nome: 'z', rotulo: 'z', tipo: 'numero', padrao: numero(1) },
    ],
    devolve: null,
    ajuda: 'Anda a partir de onde está, somando ao lugar atual.',
  },
  {
    nome: 'irPara',
    forma: 'ir para {x} {y} {z}',
    categoria: 'movimento',
    parametros: [
      { nome: 'x', rotulo: 'x', tipo: 'numero', padrao: numero(0) },
      { nome: 'y', rotulo: 'y', tipo: 'numero', padrao: numero(0) },
      { nome: 'z', rotulo: 'z', tipo: 'numero', padrao: numero(0) },
    ],
    devolve: null,
    ajuda: 'Vai direto para um lugar, sem passar pelo caminho.',
  },
  {
    nome: 'girar',
    forma: 'girar {graus} graus',
    categoria: 'movimento',
    parametros: [{ nome: 'graus', rotulo: '', tipo: 'numero', padrao: numero(90) }],
    devolve: null,
    ajuda: 'Gira em torno do próprio eixo.',
  },
  {
    nome: 'empurrar',
    forma: 'empurrar o jogador para cima {forca}',
    categoria: 'movimento',
    parametros: [{ nome: 'forca', rotulo: 'força', tipo: 'numero', padrao: numero(20) }],
    devolve: null,
    ajuda: 'Dá um impulso no personagem, como uma mola.',
  },
  // --- Cena -----------------------------------------------------------------
  //
  // Os unicos blocos que falam de *outra* peca. Todo o resto age em quem tem o
  // script — e essa distincao e proposital: "abrir a porta la longe" e uma
  // ideia bem mais dificil do que "sumir", e merece um lugar separado na
  // gaveta, e nao ficar misturada com o que age em mim.
  {
    nome: 'abrir',
    forma: 'abrir {peca}',
    categoria: 'cena',
    parametros: [{ nome: 'peca', rotulo: '', tipo: 'peca', padrao: texto('') }],
    devolve: null,
    ajuda: 'Uma porta desce e libera a passagem.',
  },
  {
    nome: 'fechar',
    forma: 'fechar {peca}',
    categoria: 'cena',
    parametros: [{ nome: 'peca', rotulo: '', tipo: 'peca', padrao: texto('') }],
    devolve: null,
    ajuda: 'A porta sobe de volta e barra a passagem.',
  },
  {
    nome: 'esconderPeca',
    forma: 'esconder {peca}',
    categoria: 'cena',
    parametros: [{ nome: 'peca', rotulo: '', tipo: 'peca', padrao: texto('') }],
    devolve: null,
    ajuda: 'Some com outra peça da fase, e tira ela do caminho.',
  },
  {
    nome: 'mostrarPeca',
    forma: 'mostrar {peca}',
    categoria: 'cena',
    parametros: [{ nome: 'peca', rotulo: '', tipo: 'peca', padrao: texto('') }],
    devolve: null,
    ajuda: 'Traz de volta uma peça que estava escondida.',
  },
  // --- Jogo -----------------------------------------------------------------
  {
    nome: 'darAneis',
    forma: 'dar {quantos} anéis',
    categoria: 'jogo',
    parametros: [{ nome: 'quantos', rotulo: '', tipo: 'numero', padrao: numero(1) }],
    devolve: null,
    ajuda: 'Soma anéis ao placar.',
  },
  {
    nome: 'tirarVida',
    forma: 'tirar uma vida',
    categoria: 'jogo',
    parametros: [],
    devolve: null,
    ajuda: 'Machuca o personagem, como um inimigo faria.',
  },
  {
    nome: 'terminarFase',
    forma: 'terminar a fase',
    categoria: 'jogo',
    parametros: [],
    devolve: null,
    ajuda: 'Ganha o jogo na hora, como se tivesse encostado na meta.',
  },
  {
    nome: 'esconder',
    forma: 'esconder',
    categoria: 'jogo',
    parametros: [],
    devolve: null,
    ajuda: 'Some da tela. A peça continua existindo.',
  },
  {
    nome: 'mostrar',
    forma: 'mostrar',
    categoria: 'jogo',
    parametros: [],
    devolve: null,
    ajuda: 'Aparece de novo.',
  },
  {
    nome: 'tocarSom',
    forma: 'tocar som {som}',
    categoria: 'jogo',
    parametros: [{ nome: 'som', rotulo: '', tipo: 'som', padrao: texto('porta') }],
    devolve: null,
    ajuda: 'Toca um dos sons da engine.',
  },
  {
    nome: 'dizer',
    forma: 'dizer {mensagem}',
    categoria: 'jogo',
    parametros: [{ nome: 'mensagem', rotulo: '', tipo: 'texto', padrao: texto('Oi!') }],
    devolve: null,
    ajuda: 'Escreve um recado na tela por alguns segundos.',
  },
  // --- Valores ---------------------------------------------------------------
  {
    nome: 'meuX',
    forma: 'meu x',
    categoria: 'valores',
    parametros: [],
    devolve: 'numero',
    ajuda: 'Onde esta peça está, no eixo x.',
  },
  {
    nome: 'meuY',
    forma: 'meu y',
    categoria: 'valores',
    parametros: [],
    devolve: 'numero',
    ajuda: 'Onde esta peça está, no eixo y (a altura).',
  },
  {
    nome: 'meuZ',
    forma: 'meu z',
    categoria: 'valores',
    parametros: [],
    devolve: 'numero',
    ajuda: 'Onde esta peça está, no eixo z.',
  },
  {
    nome: 'aneis',
    forma: 'anéis do jogador',
    categoria: 'valores',
    parametros: [],
    devolve: 'numero',
    ajuda: 'Quantos anéis o jogador tem agora.',
  },
  {
    nome: 'tempo',
    forma: 'tempo de jogo',
    categoria: 'valores',
    parametros: [],
    devolve: 'numero',
    ajuda: 'Segundos desde o começo da fase.',
  },
  {
    nome: 'distanciaDoJogador',
    forma: 'distância até o jogador',
    categoria: 'valores',
    parametros: [],
    devolve: 'numero',
    ajuda: 'Quanto falta, em linha reta, entre esta peça e o personagem.',
  },
  {
    nome: 'aleatorio',
    forma: 'número de sorte entre {minimo} e {maximo}',
    categoria: 'valores',
    parametros: [
      { nome: 'minimo', rotulo: '', tipo: 'numero', padrao: numero(1) },
      { nome: 'maximo', rotulo: '', tipo: 'numero', padrao: numero(6) },
    ],
    devolve: 'numero',
    ajuda: 'Sorteia um número.',
  },
];

const POR_NOME = new Map(BLOCOS.map((bloco) => [bloco.nome, bloco]));
const EVENTO_POR_NOME = new Map(EVENTOS.map((evento) => [evento.nome, evento]));

export function acharBloco(nome: string): BlocoDefinicao | null {
  return POR_NOME.get(nome) ?? null;
}

export function acharEvento(nome: string): EventoDefinicao | null {
  return EVENTO_POR_NOME.get(nome) ?? null;
}

/** Os pedacos da forma de um bloco, separando palavra de buraco. */
export type PedacoDaForma =
  | { tipo: 'palavra'; texto: string }
  | { tipo: 'buraco'; parametro: string };

export function pedacos(forma: string): PedacoDaForma[] {
  const saida: PedacoDaForma[] = [];
  const partes = forma.split(/(\{[^}]+\})/g);
  for (const parte of partes) {
    if (!parte) continue;
    if (parte.startsWith('{') && parte.endsWith('}')) {
      saida.push({ tipo: 'buraco', parametro: parte.slice(1, -1) });
    } else {
      const limpo = parte.trim();
      if (limpo) saida.push({ tipo: 'palavra', texto: limpo });
    }
  }
  return saida;
}
