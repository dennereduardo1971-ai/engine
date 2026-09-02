import * as THREE from 'three';

/**
 * Pecas modulares — o jeito de montar uma fase sem programar nada.
 *
 * A secao 9 do plano lista tres ferramentas de construcao de fase: spline de
 * pista (a M7, em `spline.ts`), pecas modulares numa grade e terreno
 * esculpivel — o terreno vem depois. As pecas modulares bastam para a
 * promessa da M3: montar uma pista e testar na hora.
 *
 * Uma peca e so uma descricao: qual malha, que cor, se ela e pisavel e que
 * componentes ela leva. Quem transforma isso em entidade e objeto do Three.js
 * e o montador.
 */

export type MeshKind =
  | 'grupo'
  | 'caixa'
  | 'rampa'
  | 'curva'
  | 'loop'
  | 'anel'
  | 'cone'
  | 'marco'
  | 'mola'
  | 'inimigo'
  /**
   * Pista desenhada (secao 9: spline de pista, a M7). A geometria de
   * `buildGeometry` abaixo e so um marcador vazio — a malha de verdade sai
   * de `node.spline` a cada no, no montador, porque cada pista desenhada e
   * unica (o cache por `piece.id` deste arquivo assume uma malha por tipo).
   */
  | 'spline';

export interface MeshSpec {
  kind: MeshKind;
  /** Largura (X), altura (Y) e comprimento (Z), em unidades. */
  size: [number, number, number];
  /** Curva e loop: raio de dentro, raio de fora e quanto vira, em graus. */
  inner?: number;
  outer?: number;
  arc?: number;
  /** Anel: raio e grossura. */
  radius?: number;
  tube?: number;
}

export interface Piece {
  id: string;
  /** Nome na interface, em portugues (secao 6). */
  label: string;
  icon: string;
  group: 'jogo' | 'pista' | 'coletavel' | 'cenario';
  /** Uma linha de ajuda no painel de pecas. */
  hint: string;
  mesh: MeshSpec;
  color: number;
  /**
   * Muitas iguais numa chamada de desenho so. O orcamento da secao 3 da 300
   * chamadas por quadro: sem isto, uma fase de Sonic gasta isso so com anel.
   */
  instanced: boolean;
  /** Quantas cabem no lote instanciado. So vale com `instanced`. */
  capacity?: number;
  /**
   * A peca tem colisor.
   *
   * Desde a M2 isso e literal: a malha da peca vira um colisor de malha no
   * Rapier, do jeito que ela e. E por isso que o loop funciona — nao ha
   * aproximacao por caixas no meio do caminho.
   */
  solid: boolean;
  /** Altura em que a peca nasce quando e colocada. */
  dropY: number;
  /** Componentes que a peca leva, com os valores de fabrica dela. */
  components: Record<string, Record<string, number>>;
  /** So pode existir uma na fase (o ponto de partida). */
  unique?: boolean;
  /**
   * Peca de marcacao: aparece so no editor, e some quando o jogo roda.
   *
   * A Area e o caso: ela e o "aqui" de *"quando o jogador entra aqui"*, e o
   * "aqui" e um lugar, e nao um objeto. Quem monta a fase precisa ver onde ele
   * fica; quem joga nao pode ver caixa nenhuma flutuando na pista.
   */
  soNoEditor?: boolean;
}

/**
 * A peca fica apoiada pela base: o Y do no e onde ela encosta. Uma reta
 * colocada em Y=4 tem o piso em 4,5 — a grossura dela. E uma regra so, para
 * toda peca, e por isso ela cabe na cabeca de quem esta montando a fase.
 */
export const PIECES: readonly Piece[] = [
  {
    id: 'grupo',
    label: 'Grupo',
    icon: '📁',
    group: 'jogo',
    hint: 'Uma pasta na árvore. O que estiver dentro anda junto com ela.',
    mesh: { kind: 'grupo', size: [0, 0, 0] },
    color: 0x8ea2c6,
    instanced: false,
    solid: false,
    dropY: 0,
    components: {},
  },
  {
    id: 'inicio',
    label: 'Ponto de Partida',
    icon: '🚩',
    group: 'jogo',
    hint: 'Onde o personagem nasce. Os deslizadores dele ficam aqui.',
    mesh: { kind: 'marco', size: [1, 3, 1] },
    color: 0x4ade80,
    instanced: false,
    solid: false,
    dropY: 0,
    unique: true,
    // Os deslizadores do Personagem Veloz e da camera moram no ponto de
    // partida: e mexendo neles, com o jogo rodando, que da para acertar o
    // "sentir" do controlador sem reiniciar a fase.
    components: { SpeedCharacter: {}, FollowCamera: {} },
  },
  {
    id: 'reta',
    label: 'Reta',
    icon: '▬',
    group: 'pista',
    hint: 'Um trecho de pista de 8 por 8.',
    mesh: { kind: 'caixa', size: [8, 0.5, 8] },
    color: 0x3f4c70,
    instanced: false,
    solid: true,
    dropY: 0,
    components: {},
  },
  {
    id: 'rampa',
    label: 'Rampa',
    icon: '◺',
    group: 'pista',
    hint: 'Sobe 4 em 8. Ganha velocidade descendo.',
    mesh: { kind: 'rampa', size: [8, 4, 8] },
    color: 0x46557d,
    instanced: false,
    solid: true,
    dropY: 0,
    components: {},
  },
  {
    id: 'curva',
    label: 'Curva',
    icon: '◜',
    group: 'pista',
    hint: 'Vira 90°, girando em torno do centro da curva.',
    mesh: { kind: 'curva', size: [1, 0.5, 1], inner: 6, outer: 14, arc: 90 },
    color: 0x3f4c70,
    instanced: false,
    solid: true,
    dropY: 0,
    components: {},
  },
  {
    id: 'plataforma',
    label: 'Plataforma',
    icon: '▫',
    group: 'pista',
    hint: 'Pedaço pequeno, para pular de um para o outro.',
    mesh: { kind: 'caixa', size: [4, 0.5, 4] },
    color: 0x53639a,
    instanced: false,
    solid: true,
    dropY: 0,
    components: {},
  },
  {
    id: 'bloco',
    label: 'Bloco',
    icon: '🧱',
    group: 'pista',
    hint: 'Um cubo para escalar ou para fechar caminho.',
    mesh: { kind: 'caixa', size: [2, 2, 2] },
    color: 0x8a6b46,
    instanced: true,
    solid: true,
    dropY: 0,
    components: {},
  },
  {
    id: 'porta',
    label: 'Porta',
    icon: '🚪',
    group: 'jogo',
    hint: 'Barra a passagem até uma regra mandar abrir. Ao abrir, ela desce e some no chão.',
    mesh: { kind: 'caixa', size: [8, 5, 0.8] },
    color: 0x8a6a3f,
    instanced: false,
    solid: true,
    dropY: 0,
    // O percurso e um pouco maior que a altura: assim a porta aberta some
    // inteira no chao, em vez de deixar uma faixa de madeira aparecendo.
    components: { Porta: { travel: 5.4, speed: 9 } },
  },
  {
    id: 'area',
    label: 'Área',
    icon: '🟦',
    group: 'jogo',
    hint: 'Uma região invisível. É o "aqui" de "quando o jogador chegar aqui".',
    mesh: { kind: 'caixa', size: [8, 6, 4] },
    color: 0x4f9dff,
    instanced: false,
    solid: false,
    dropY: 0,
    soNoEditor: true,
    components: {},
  },
  {
    id: 'anel',
    label: 'Anel',
    icon: '💍',
    group: 'coletavel',
    hint: 'O coletável clássico. Todos numa chamada de desenho só.',
    mesh: { kind: 'anel', size: [1.6, 1.6, 0.4], radius: 0.62, tube: 0.16 },
    color: 0xf5c542,
    instanced: true,
    capacity: 20_000,
    solid: false,
    dropY: 1.2,
    components: { Collectible: { value: 1, radius: 1.3 } },
  },
  {
    id: 'loop',
    label: 'Loop',
    icon: '🔁',
    group: 'pista',
    hint: 'O loop-the-loop. Entre a toda: devagar, ele solta no meio.',
    // O aro para de girar 45 graus antes de fechar. Um loop fechado, encostado
    // no chao, *nao tem entrada*: o pedaco que desce para a saida passa rente
    // ao chao bem no caminho de quem esta chegando, e barra a passagem antes
    // que ele alcance a base. O vao e por onde se entra, e a saida vira um
    // pulinho de duas unidades.
    mesh: { kind: 'loop', size: [8, 0.6, 0], inner: 7, arc: 315 },
    color: 0x46557d,
    instanced: false,
    solid: true,
    dropY: 0,
    components: {},
  },
  {
    id: 'pista-spline',
    label: 'Pista',
    icon: '🛣️',
    group: 'pista',
    hint: 'Desenhe clicando: cada clique poe um ponto, e a linha vira estrada.',
    // Placeholder: a malha de verdade vem de `node.spline` (ver MeshKind).
    mesh: { kind: 'spline', size: [0, 0, 0] },
    color: 0x3f4c70,
    instanced: false,
    solid: true,
    dropY: 0,
    components: {},
  },
  {
    id: 'mola',
    label: 'Mola',
    icon: '🔺',
    group: 'pista',
    hint: 'Joga o personagem para o lado que ela aponta. Gire-a para atirar de lado.',
    mesh: { kind: 'mola', size: [1.9, 0.7, 1.9] },
    color: 0xf05a5a,
    instanced: true,
    solid: false,
    dropY: 0,
    components: { Spring: { power: 26, radius: 1.4 } },
  },
  {
    id: 'patrulheiro',
    label: 'Patrulheiro',
    icon: '👾',
    group: 'jogo',
    hint: 'Anda de um lado para o outro. Pise em cima para derrotar; encoste de lado e se machuque.',
    mesh: { kind: 'inimigo', size: [1.7, 1.7, 1.7] },
    color: 0xb45cf0,
    instanced: true,
    solid: false,
    dropY: 0.85,
    components: { Patroller: { speed: 4, range: 6, radius: 0.9 } },
  },
  {
    id: 'meta',
    label: 'Meta',
    icon: '🏁',
    group: 'jogo',
    hint: 'O fim da fase. Encostar aqui termina o jogo.',
    mesh: { kind: 'marco', size: [1.5, 5.5, 0.3] },
    color: 0x4ade80,
    instanced: false,
    solid: false,
    dropY: 0,
    components: { Goal: { radius: 2.2 } },
  },
  {
    id: 'arvore',
    label: 'Árvore',
    icon: '🌲',
    group: 'cenario',
    hint: 'Enfeite. Serve para ver a velocidade passando.',
    mesh: { kind: 'cone', size: [2.4, 5, 2.4] },
    color: 0x2f7d4f,
    instanced: true,
    solid: false,
    dropY: 0,
    components: {},
  },
];

const BY_ID = new Map(PIECES.map((piece) => [piece.id, piece]));

export function findPiece(id: string): Piece | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Peca desconhecida (arquivo de uma versao mais nova, peca renomeada): em vez
 * de perder o no, ele vira um cubo roxo com o nome da peca que faltou. O
 * arquivo continua carregando, e da para ver na tela o que esta faltando.
 */
export function pieceOrPlaceholder(id: string): Piece {
  return (
    BY_ID.get(id) ?? {
      id,
      label: `Peça desconhecida (${id})`,
      icon: '❓',
      group: 'cenario',
      hint: 'Esta peça não existe nesta versão da Faísca.',
      mesh: { kind: 'caixa', size: [2, 2, 2] },
      color: 0xb45cf0,
      instanced: false,
      solid: false,
      dropY: 0,
      components: {},
    }
  );
}

// --- Malhas -----------------------------------------------------------------

const geometryCache = new Map<string, THREE.BufferGeometry>();

/** Geometria da peca, criada uma vez e reaproveitada por todas as copias. */
export function pieceGeometry(piece: Piece): THREE.BufferGeometry {
  const cached = geometryCache.get(piece.id);
  if (cached) return cached;
  const geometry = buildGeometry(piece.mesh);
  geometry.computeBoundingBox();
  geometryCache.set(piece.id, geometry);
  return geometry;
}

function buildGeometry(mesh: MeshSpec): THREE.BufferGeometry {
  const [w, h, d] = mesh.size;
  switch (mesh.kind) {
    case 'grupo':
      // Um grupo nao desenha nada: ele so segura os filhos na arvore.
      return new THREE.BufferGeometry();
    case 'spline':
      // Marcador vazio — o montador troca por `buildSplineGeometry(node.spline)`.
      return new THREE.BufferGeometry();
    case 'caixa': {
      const geometry = new THREE.BoxGeometry(w, h, d);
      geometry.translate(0, h / 2, 0);
      return geometry;
    }
    case 'rampa': {
      // Um prisma triangular: sobe de 0 ate `h` andando para o +Z. Sai de um
      // triangulo achatado no plano da tela e deitado depois, que e bem menos
      // codigo (e menos erro de normal) do que montar as seis faces na mao.
      const forma = new THREE.Shape();
      forma.moveTo(-d / 2, 0);
      forma.lineTo(d / 2, 0);
      forma.lineTo(d / 2, h);
      forma.closePath();
      const geometry = new THREE.ExtrudeGeometry(forma, { depth: w, bevelEnabled: false });
      // O X da forma vira o Z do mundo, e a espessura vira a largura em X.
      geometry.rotateY(-Math.PI / 2);
      geometry.translate(w / 2, 0, 0);
      return geometry;
    }
    case 'curva': {
      const inner = mesh.inner ?? 6;
      const outer = mesh.outer ?? 14;
      const arc = THREE.MathUtils.degToRad(mesh.arc ?? 90);
      const forma = new THREE.Shape();
      forma.absarc(0, 0, outer, 0, arc, false);
      forma.absarc(0, 0, inner, arc, 0, true);
      const geometry = new THREE.ExtrudeGeometry(forma, {
        depth: h,
        bevelEnabled: false,
        curveSegments: 24,
      });
      // Deita o setor: o Y da forma vira -Z do mundo, e a espessura vira
      // altura. A curva sai do +X e vai para o -Z.
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }
    case 'loop': {
      // Uma faixa de pista girando num plano vertical. O angulo zero e a base,
      // encostada no chao, e o aro sobe andando para o -Z — a mesma direcao em
      // que uma reta corre.
      const inner = mesh.inner ?? 7;
      const outer = inner + (h || 0.6);
      const volta = THREE.MathUtils.degToRad(mesh.arc ?? 315);
      const forma = new THREE.Shape();
      const inicio = -Math.PI / 2;
      forma.absarc(0, 0, inner, inicio, inicio + volta, false);
      forma.absarc(0, 0, outer, inicio + volta, inicio, true);
      const geometry = new THREE.ExtrudeGeometry(forma, {
        depth: w,
        bevelEnabled: false,
        curveSegments: 64,
      });
      geometry.translate(0, 0, -w / 2);
      // O X da forma vira o Z do mundo, e a espessura da extrusao vira a
      // largura da pista em X.
      geometry.rotateY(Math.PI / 2);
      // Sobe o aro para a base dele encostar no chao da peca.
      geometry.translate(0, inner, 0);
      return geometry;
    }
    case 'anel': {
      // 5 x 12 segmentos: um anel e visto de longe e em movimento, e mais que
      // isso e triangulo gasto sem ninguem ver.
      return new THREE.TorusGeometry(mesh.radius ?? 0.62, mesh.tube ?? 0.16, 5, 12);
    }
    case 'cone': {
      const geometry = new THREE.ConeGeometry(w / 2, h, 7);
      geometry.translate(0, h / 2, 0);
      return geometry;
    }
    case 'mola': {
      const [w, h] = mesh.size;
      // Uma almofada: larga em cima, mais estreita embaixo. De longe se
      // reconhece que e para pisar.
      const almofada = new THREE.CylinderGeometry(w / 2, w * 0.36, h, 14);
      almofada.translate(0, h / 2, 0);
      const base = new THREE.CylinderGeometry(w * 0.4, w * 0.44, h * 0.3, 14);
      base.translate(0, h * 0.15, 0);
      return mergeGeometries([base, almofada]);
    }
    case 'inimigo': {
      const [w, h] = mesh.size;
      // Corpo redondo e um espinho em cima: a silhueta ja avisa que pisar nele
      // e o jeito, e que encostar de lado nao e.
      const corpo = new THREE.SphereGeometry(w / 2, 12, 8);
      corpo.scale(1, (h * 0.7) / w, 1);
      corpo.translate(0, h * 0.42, 0);
      const espinho = new THREE.ConeGeometry(w * 0.18, h * 0.34, 6);
      espinho.translate(0, h * 0.82, 0);
      return mergeGeometries([corpo, espinho]);
    }
    case 'marco': {
      // Bandeira: um mastro fino e um triangulo em cima. Grupo nao da para
      // instanciar, e nao precisa: ponto de partida so tem um.
      const mastro = new THREE.CylinderGeometry(0.09, 0.09, h, 6);
      mastro.translate(0, h / 2, 0);
      const bandeira = new THREE.ConeGeometry(0.5, 0.9, 3);
      bandeira.rotateZ(-Math.PI / 2);
      bandeira.translate(0.42, h - 0.5, 0);
      return mergeGeometries([mastro, bandeira]);
    }
  }
}

/**
 * Junta geometrias simples numa so. Existe para o marco nao virar um grupo de
 * dois objetos: um objeto por no mantem a selecao por clique simples.
 */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const part of parts) {
    const indexed = part.index ? part.toNonIndexed() : part;
    positions.push(...Array.from(indexed.getAttribute('position').array));
    normals.push(...Array.from(indexed.getAttribute('normal').array));
    if (indexed !== part) indexed.dispose();
    part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

/** Caixa que envolve a peca — e dela que sai o contorno da selecao. */
export function pieceBounds(piece: Piece): THREE.Box3 {
  const box = pieceGeometry(piece).boundingBox;
  return box ? box.clone() : new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
}

// --- Colisor ----------------------------------------------------------------

export interface TrimeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

const trimeshCache = new Map<string, TrimeshData>();

/**
 * A malha da peca no formato que o Rapier entende, criada uma vez e
 * reaproveitada.
 *
 * Malha, e nao caixa: a rampa, a curva e o loop *sao* a forma deles, e trocar
 * isso por caixas seria perder exatamente a superficie que o personagem
 * precisa seguir. Malha nao serve para corpo que se move — mas pista nao se
 * move.
 */
export function pieceTrimesh(piece: Piece): TrimeshData | null {
  // Grupo nao tem malha, e spline tem a malha dela mesma no montador — nao no
  // cache por tipo desta funcao (ver MeshKind).
  if (!piece.solid || piece.mesh.kind === 'grupo' || piece.mesh.kind === 'spline') return null;
  const cached = trimeshCache.get(piece.id);
  if (cached) return cached;

  const geometry = pieceGeometry(piece);
  const posicoes = geometry.getAttribute('position');
  const vertices = new Float32Array(posicoes.array);
  const index = geometry.getIndex();
  const indices = index
    ? new Uint32Array(index.array)
    : // Geometria sem indice: os vertices ja vem em ordem, tres a tres.
      Uint32Array.from({ length: posicoes.count }, (_valor, i) => i);

  const data: TrimeshData = { vertices, indices };
  trimeshCache.set(piece.id, data);
  return data;
}

/** A mesma malha, com a escala do no ja aplicada aos vertices. */
export function scaledTrimesh(
  piece: Piece,
  sx: number,
  sy: number,
  sz: number,
): TrimeshData | null {
  const base = pieceTrimesh(piece);
  if (!base) return null;
  if (sx === 1 && sy === 1 && sz === 1) return base;
  // O Rapier nao escala colisor de malha: quem escala e a lista de vertices.
  const vertices = new Float32Array(base.vertices.length);
  for (let i = 0; i < base.vertices.length; i += 3) {
    vertices[i] = base.vertices[i] * sx;
    vertices[i + 1] = base.vertices[i + 1] * sy;
    vertices[i + 2] = base.vertices[i + 2] * sz;
  }
  return { vertices, indices: base.indices };
}
