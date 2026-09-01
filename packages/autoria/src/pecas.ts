import * as THREE from 'three';

/**
 * Pecas modulares — o jeito de montar uma fase sem programar nada.
 *
 * A secao 9 do plano lista tres ferramentas de construcao de fase: spline de
 * pista, pecas modulares numa grade e terreno esculpivel. A spline e a M7; o
 * terreno vem depois. As pecas sao o que da para entregar agora, e sao o
 * suficiente para a promessa da M3: montar uma pista e testar na hora.
 *
 * Uma peca e so uma descricao: qual malha, que cor, se ela e pisavel e que
 * componentes ela leva. Quem transforma isso em entidade e objeto do Three.js
 * e o montador.
 */

export type MeshKind = 'grupo' | 'caixa' | 'rampa' | 'curva' | 'anel' | 'cone' | 'marco';

/**
 * Como a peca sustenta o personagem no teste ao vivo.
 *
 * Isto e provisorio e esta assumido: e uma consulta de altura, nao um colisor.
 * A M2 troca tudo por Rapier, que traz parede, rampa de verdade e a superficie
 * grudenta do loop. Ate la, da para andar em cima das pecas — que e o que a
 * M3 precisa para "testar na hora" significar alguma coisa.
 */
export type SurfaceKind = 'nenhuma' | 'caixa' | 'rampa' | 'setor';

export interface MeshSpec {
  kind: MeshKind;
  /** Largura (X), altura (Y) e comprimento (Z), em unidades. */
  size: [number, number, number];
  /** Curva: raio de dentro, raio de fora e quanto ela vira, em graus. */
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
  surface: SurfaceKind;
  /** Altura em que a peca nasce quando e colocada. */
  dropY: number;
  /** Componentes que a peca leva, com os valores de fabrica dela. */
  components: Record<string, Record<string, number>>;
  /** So pode existir uma na fase (o ponto de partida). */
  unique?: boolean;
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
    surface: 'nenhuma',
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
    surface: 'nenhuma',
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
    surface: 'caixa',
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
    surface: 'rampa',
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
    surface: 'setor',
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
    surface: 'caixa',
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
    surface: 'caixa',
    dropY: 0,
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
    surface: 'nenhuma',
    dropY: 1.2,
    components: {},
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
    surface: 'nenhuma',
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
      surface: 'nenhuma',
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

// --- Chao pisavel -----------------------------------------------------------

export interface Placement {
  piece: Piece;
  x: number;
  y: number;
  z: number;
  /** Guinada em radianos. */
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Altura do topo da peca em (wx, wz), ou `null` se o ponto esta fora dela.
 *
 * Provisorio, e de proposito: e uma consulta de altura, nao um colisor. Nao
 * existe parede, nao existe teto e nao existe superficie grudenta. Tudo isso
 * chega com o Rapier na M2 — aqui so precisa dar para subir a rampa e ficar em
 * pe na plataforma enquanto se monta a fase.
 */
export function surfaceHeightAt(place: Placement, wx: number, wz: number): number | null {
  const { piece } = place;
  if (piece.surface === 'nenhuma') return null;

  // Ponto no espaco da peca: desfaz a posicao e a guinada.
  const dx = wx - place.x;
  const dz = wz - place.z;
  const cos = Math.cos(place.yaw);
  const sin = Math.sin(place.yaw);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;

  const [w, h, d] = piece.mesh.size;

  if (piece.surface === 'caixa' || piece.surface === 'rampa') {
    const meiaLargura = (w * place.sx) / 2;
    const meioComprimento = (d * place.sz) / 2;
    if (Math.abs(lx) > meiaLargura || Math.abs(lz) > meioComprimento) return null;
    const altura = h * place.sy;
    if (piece.surface === 'caixa') return place.y + altura;
    // A rampa sobe andando para o +Z dela.
    const subida = (lz + meioComprimento) / (meioComprimento * 2);
    return place.y + altura * Math.min(1, Math.max(0, subida));
  }

  // Setor de coroa (a curva): raio dentro da faixa e angulo dentro do arco.
  const inner = (piece.mesh.inner ?? 0) * place.sx;
  const outer = (piece.mesh.outer ?? 0) * place.sx;
  const raio = Math.hypot(lx, lz);
  if (raio < inner || raio > outer) return null;
  const arco = THREE.MathUtils.degToRad(piece.mesh.arc ?? 90);
  // A curva sai do +X indo para o -Z (e assim que a geometria foi deitada).
  let angulo = Math.atan2(-lz, lx);
  if (angulo < 0) angulo += Math.PI * 2;
  if (angulo > arco) return null;
  return place.y + h * place.sy;
}
