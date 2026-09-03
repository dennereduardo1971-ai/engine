/**
 * Faisca — camada de interface.
 *
 * O documento de uma tela (HUD, menu), o catalogo de elementos com que ela e
 * montada, e o formato `.ui` que grava tudo isso em texto legivel.
 *
 * Fatia 1 da M9: so o modelo de dados, puro e testavel. Sem editor de
 * arrastar (fatia 2) e sem sistema no runtime que sincroniza isto com DOM de
 * verdade (fatia 3) ainda.
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
