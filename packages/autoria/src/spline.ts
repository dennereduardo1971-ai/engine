import * as THREE from 'three';

/**
 * Spline de pista — a M7.
 *
 * A terceira ferramenta de fase da secao 9 do plano, e o carro-chefe delas:
 * uma linha desenhada no espaco vira uma fita com largura e inclinacao
 * (banking), com o mesmo par geometria/colisor de malha que as pecas ja usam
 * (`pecas.ts`) — "a peca desenhada e a peca colidida" continua valendo.
 *
 * Loop vertical de verdade (a curva virando de cabeca para baixo) fica fora
 * desta fatia: o controlador de movimento ja segue qualquer normal de
 * colisor, mas autoria de um giro de 360 graus por um quadro so de
 * largura+inclinacao e um problema maior, e a M7 entrega o resto primeiro.
 */

export interface SplinePoint {
  x: number;
  y: number;
  z: number;
  /** Largura da pista neste ponto, em unidades. */
  largura: number;
  /** Inclinacao (banking) em graus, girando a secao em torno da tangente. */
  inclinacao: number;
}

export interface SplineTrimesh {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface SplineMesh {
  geometry: THREE.BufferGeometry;
  trimesh: SplineTrimesh;
}

/** Largura minima: uma pista mais fina que isso nao segura ninguem em cima. */
const LARGURA_MINIMA = 0.5;

const CIMA_MUNDO = new THREE.Vector3(0, 1, 0);
/** Usada no lugar do "cima" do mundo quando a tangente quase aponta para ele. */
const CIMA_ALTERNATIVA = new THREE.Vector3(0, 0, 1);

/**
 * Constroi a fita de pista a partir dos pontos de controle.
 *
 * A linha de centro sai de uma Catmull-Rom (`THREE.CatmullRomCurve3`) — a
 * mesma curva que passa exatamente pelos pontos, sem precisar de alcas de
 * controle separadas, que e o que da para desenhar clicando. Largura e
 * inclinacao sao interpoladas linearmente entre os dois pontos de controle
 * vizinhos de cada amostra.
 */
export function buildSplineGeometry(
  pontos: readonly SplinePoint[],
  fechada = false,
  segmentosPorTrecho = 8,
): SplineMesh {
  if (pontos.length < 2) {
    throw new Error('Faísca: uma pista precisa de pelo menos 2 pontos.');
  }

  const centro = pontos.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  // Centripeta, e nao a uniforme (padrao do Three): a uniforme faz uma pista
  // de so 2 pontos comecar andando para tras antes de virar para a frente —
  // um "S" que ninguem desenhou. A centripeta nao tem essa esquisitice.
  const curva = new THREE.CatmullRomCurve3(centro, fechada, 'centripetal');
  const trechos = fechada ? pontos.length : pontos.length - 1;
  const totalAmostras = trechos * segmentosPorTrecho + (fechada ? 0 : 1);

  const esquerda: THREE.Vector3[] = [];
  const direita: THREE.Vector3[] = [];

  for (let i = 0; i < totalAmostras; i++) {
    const t = i / (trechos * segmentosPorTrecho);
    const posicao = curva.getPoint(t);
    // `curva.getTangent` inverte a direcao bem em t=0 numa curva aberta (uma
    // esquisitice do Three.js). Diferenca finita nao tem essa armadilha.
    const epsilon = 1e-4;
    const tangente = curva
      .getPoint(Math.min(1, t + epsilon))
      .sub(curva.getPoint(Math.max(0, t - epsilon)))
      .normalize();

    const referencia = Math.abs(tangente.dot(CIMA_MUNDO)) > 0.99 ? CIMA_ALTERNATIVA : CIMA_MUNDO;
    const lado = new THREE.Vector3().crossVectors(tangente, referencia).normalize();
    const cima = new THREE.Vector3().crossVectors(tangente, lado).normalize();

    const { largura, inclinacao } = perfilEm(pontos, t, trechos);
    const banco = THREE.MathUtils.degToRad(inclinacao);
    // O banking gira o par lado/cima em torno da tangente — o proprio "lado"
    // ganha um componente vertical, que e o que inclina a fita.
    const ladoBancado = lado
      .clone()
      .multiplyScalar(Math.cos(banco))
      .addScaledVector(cima, Math.sin(banco));

    const meiaLargura = Math.max(LARGURA_MINIMA, largura) / 2;
    esquerda.push(posicao.clone().addScaledVector(ladoBancado, -meiaLargura));
    direita.push(posicao.clone().addScaledVector(ladoBancado, meiaLargura));
  }

  return montarFita(esquerda, direita, fechada);
}

/** Largura e inclinacao no parametro `t` (0..1), por interpolacao entre pontos vizinhos. */
function perfilEm(
  pontos: readonly SplinePoint[],
  t: number,
  trechos: number,
): { largura: number; inclinacao: number } {
  const posicao = Math.min(t * trechos, trechos - 1e-9);
  const indice = Math.max(0, Math.min(trechos - 1, Math.floor(posicao)));
  const local = posicao - indice;
  const a = pontos[indice];
  const b = pontos[(indice + 1) % pontos.length];
  return {
    largura: THREE.MathUtils.lerp(a.largura, b.largura, local),
    inclinacao: THREE.MathUtils.lerp(a.inclinacao, b.inclinacao, local),
  };
}

/** Junta as duas bordas numa fita triangulada, com a normal apontando para "cima". */
function montarFita(
  esquerda: THREE.Vector3[],
  direita: THREE.Vector3[],
  fechada: boolean,
): SplineMesh {
  const amostras = esquerda.length;
  const positions = new Float32Array(amostras * 2 * 3);
  for (let i = 0; i < amostras; i++) {
    positions.set([esquerda[i].x, esquerda[i].y, esquerda[i].z], i * 6);
    positions.set([direita[i].x, direita[i].y, direita[i].z], i * 6 + 3);
  }

  const indices: number[] = [];
  const trechosDeQuad = fechada ? amostras : amostras - 1;
  for (let i = 0; i < trechosDeQuad; i++) {
    const j = (i + 1) % amostras;
    const el = i * 2;
    const er = i * 2 + 1;
    const nl = j * 2;
    const nr = j * 2 + 1;
    // Ordem que da normal para +cima — travada em spline.test.ts.
    indices.push(el, er, nl);
    indices.push(nl, er, nr);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  return {
    geometry,
    trimesh: { vertices: positions, indices: Uint32Array.from(indices) },
  };
}
