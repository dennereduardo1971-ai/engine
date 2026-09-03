/**
 * Faisca — camada de interface.
 *
 * O documento de uma tela (HUD, menu), o catalogo de elementos com que ela e
 * montada, e o formato `.ui` que grava tudo isso em texto legivel.
 *
 * Fatia 1: o modelo de dados, puro e testavel. Fatia 2: o painel de edicao
 * por arrastar no editor (`apps/editor`). Fatia 3: o `UiRenderer`, que
 * sincroniza o documento com elementos DOM de verdade. Fatia 4: o clique de
 * botao (`onClique`), os campos vivos (`CamposVivos`) e os temas prontos
 * (`TEMAS`) — o que fechou a M9.
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
  type Clique,
  type CliqueListener,
} from './renderizador.ts';

export { CamposVivos, type Fonte, type Ligacao } from './vivo.ts';

export { TEMAS, aplicarTema, findTema, type EstiloDoTipo, type Tema } from './temas.ts';
