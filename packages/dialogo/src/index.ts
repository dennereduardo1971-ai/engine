/**
 * Faisca — dialogos e cutscenes (M10).
 *
 * A secao 10 do plano pede duas coisas que parecem diferentes e sao a mesma:
 * "balões de fala, escolhas" e "timeline de câmera, falas e ações". As duas
 * sao roteiro — uma deixa o jogador escolher, a outra roda sozinha no tempo.
 *
 * Fatia 1: a conversa (documento, maquina de estados e formato `.dialogo`),
 * pura e testavel, sem DOM e sem laço de jogo. Fatia 2: a cutscene (linha do
 * tempo, cursor e formato `.cutscene`), tambem sem tocar na cena — ela diz o
 * que esta acontecendo, e o runtime aplica.
 */
export {
  Conversa,
  FORMAT_VERSION,
  type ConversaChange,
  type ConversaData,
  type ConversaListener,
  type Opcao,
  type Passo,
} from './documento.ts';

export { Conversando, type Balao } from './maquina.ts';

export {
  CUTSCENE_VERSION,
  Rodando,
  duracaoDe,
  type Acao,
  type Acontecimento,
  type Ativa,
  type CutsceneData,
  type Marca,
} from './cutscene.ts';

export { readCutscene, readDialogo, writeCutscene, writeDialogo } from './formato.ts';
