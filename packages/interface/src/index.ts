/**
 * Faisca — camada de interface.
 *
 * O documento de uma tela (HUD, menu), o catalogo de elementos com que ela e
 * montada, e o formato `.ui` que grava tudo isso em texto legivel.
 *
 * Fatia 1: o modelo de dados, puro e testavel. Fatia 2: o painel de edicao
 * por arrastar no editor (`apps/editor`). Fatia 3: o `UiRenderer`, que
 * sincroniza o documento com elementos DOM de verdade.
 */
export {
  UiDocument,
  FORMAT_VERSION,
  type AddOptions,
  type Ancora,
  type UiChange,
  type UiData,
  type UiListener,
  type UiNode,
} from './documento.ts';

export {
  ELEMENTOS,
  elementoOuPlaceholder,
  findElemento,
  type Elemento,
  type ElementKind,
} from './elementos.ts';

export { readInterface, writeInterface } from './formato.ts';

export {
  UiRenderer,
  calcularAparencia,
  calcularPosicao,
  calcularPreenchimento,
} from './renderizador.ts';
