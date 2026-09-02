/**
 * Faisca — blocos.
 *
 * Uma arvore, duas visoes. Este pacote e a arvore, o impressor (arvore →
 * codigo), o leitor (codigo → arvore), o conferidor (erros em portugues) e o
 * interpretador (a arvore rodando). Nenhum deles e "o principal": os quatro
 * olham para a mesma estrutura.
 */
export {
  type Caminho,
  type Chamada,
  type Criar,
  type Enquanto,
  type Expressao,
  type Fazer,
  type Guardar,
  type Instrucao,
  type Nome,
  type Nota,
  type Numero,
  type Operacao,
  type Operador,
  type Oposto,
  type Quando,
  type Script,
  type Se,
  type Texto,
  type Booleano,
  copiar,
  instrucaoEm,
  listaEm,
  ramos,
  scriptVazio,
} from './arvore.ts';

export {
  acharBloco,
  acharEvento,
  BLOCOS,
  EVENTOS,
  pedacos,
  type BlocoDefinicao,
  type Categoria,
  type EventoDefinicao,
  type Parametro,
  type PedacoDaForma,
  type TipoDeValor,
} from './catalogo.ts';

export { imprimir, imprimirExpressao, imprimirInstrucao, textoEmCodigo } from './imprimir.ts';
export { ler, type ErroDeLeitura, type Leitura } from './ler.ts';
export { conferir, sugerir, type Problema } from './conferir.ts';
export {
  cabeEmRegras,
  moverAcao,
  novaAcao,
  novaRegra,
  porAcao,
  porRegra,
  regrasDe,
  scriptDeRegras,
  tirar,
  trocarEvento,
  trocarValor,
  type AcaoDeRegra,
  type Regra,
  type ValorDeRegra,
  type VistaDeRegras,
} from './regras.ts';

export {
  Instancia,
  type Ambiente,
  type ErroDeExecucao,
  type OpcoesDeExecucao,
  type Valor,
} from './interpretar.ts';
