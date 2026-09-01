/**
 * Faisca — camada de autoria.
 *
 * A camada que sabe o que e *editar* um jogo: o documento de cena, o formato
 * de arquivo em texto, as pecas modulares, o desfazer e a ponte que transforma
 * tudo isso num mundo vivo do runtime.
 *
 * Ela conhece o runtime e os kits; nao conhece o editor. E o editor que monta
 * a interface em cima disto — e e por isso que um dia da para ter dois
 * editores, ou um script de linha de comando, sem duplicar nada (secao 4 do
 * plano, regra de ouro das camadas).
 */
export {
  SceneDocument,
  FORMAT_VERSION,
  identityTransform,
  type AddOptions,
  type NodeTransform,
  type SceneChange,
  type SceneData,
  type SceneListener,
  type SceneNode,
} from './documento.ts';

export { readScene, writeScene } from './formato.ts';

export {
  findPiece,
  PIECES,
  pieceBounds,
  pieceGeometry,
  pieceOrPlaceholder,
  surfaceHeightAt,
  type MeshKind,
  type MeshSpec,
  type Piece,
  type Placement,
  type SurfaceKind,
} from './pecas.ts';

export {
  localFromWorld,
  localYawFromWorld,
  transformToWorld,
  worldPlacement,
  yawQuaternion,
  type WorldPlacement,
} from './transformacoes.ts';

export {
  heroObject,
  SceneAssembler,
  type AssemblerHost,
  type SpawnPoint,
} from './montador.ts';

export {
  componentLabel,
  describeComponent,
  describedComponents,
  factoryValues,
  type ComponentSpec,
  type FieldSpec,
} from './inspetor.ts';

export { History, type HistoryOptions } from './historico.ts';

export { faseDeExemplo } from './exemplo.ts';
