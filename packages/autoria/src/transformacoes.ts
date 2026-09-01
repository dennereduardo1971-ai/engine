import { type NodeTransform, type SceneDocument, type SceneNode } from './documento.ts';

/**
 * Da arvore para o mundo, e de volta.
 *
 * O ECS guarda posicao de mundo, sem hierarquia — e o que faz percorrer os
 * Transforms ser um laco reto em memoria contigua. Ja a arvore de cena, que e
 * o que a pessoa ve (secao 6 do plano), tem pai e filho, e mover a "Pista"
 * precisa mover a "Reta A" junto.
 *
 * Estas funcoes sao a ponte. So existe guinada em torno do Y: e o giro das
 * pecas modulares em angulos fixos (secao 9), e nao ha inclinacao para compor.
 */

export interface WorldPlacement {
  x: number;
  y: number;
  z: number;
  /** Guinada acumulada, em radianos. */
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
}

const GRAUS = Math.PI / 180;

/** Posicao, giro e tamanho do no ja no mundo, com os pais compostos. */
export function worldPlacement(document: SceneDocument, node: SceneNode): WorldPlacement {
  const cadeia: SceneNode[] = [];
  let atual: SceneNode | null = node;
  // Sobe ate a raiz. Um limite solto evita laco infinito caso um arquivo
  // editado na mao consiga descrever um ciclo de pais.
  for (let passo = 0; atual && passo < 64; passo++) {
    cadeia.push(atual);
    atual = document.get(atual.parent);
  }

  const saida: WorldPlacement = { x: 0, y: 0, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1 };
  for (let i = cadeia.length - 1; i >= 0; i--) {
    const t = cadeia[i].transform;
    const cos = Math.cos(saida.yaw);
    const sin = Math.sin(saida.yaw);
    const lx = t.x * saida.sx;
    const ly = t.y * saida.sy;
    const lz = t.z * saida.sz;
    saida.x += lx * cos + lz * sin;
    saida.y += ly;
    saida.z += -lx * sin + lz * cos;
    saida.yaw += t.yaw * GRAUS;
    saida.sx *= t.sx;
    saida.sy *= t.sy;
    saida.sz *= t.sz;
  }
  return saida;
}

/**
 * O caminho inverso: dada uma posicao de mundo, o que gravar no no para ele
 * cair exatamente ali. E o que o arrastar do viewport usa — o mouse fala em
 * mundo, o documento guarda em relacao ao pai.
 */
export function localFromWorld(
  document: SceneDocument,
  parent: string | null,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const pai = document.get(parent);
  if (!pai) return { x, y, z };
  const base = worldPlacement(document, pai);
  const dx = x - base.x;
  const dy = y - base.y;
  const dz = z - base.z;
  const cos = Math.cos(-base.yaw);
  const sin = Math.sin(-base.yaw);
  return {
    x: (dx * cos + dz * sin) / (base.sx || 1),
    y: dy / (base.sy || 1),
    z: (-dx * sin + dz * cos) / (base.sz || 1),
  };
}

/** Guinada local que deixa o no com a guinada de mundo pedida, em graus. */
export function localYawFromWorld(
  document: SceneDocument,
  parent: string | null,
  yawGraus: number,
): number {
  const pai = document.get(parent);
  if (!pai) return yawGraus;
  return yawGraus - worldPlacement(document, pai).yaw / GRAUS;
}

/** Quaternion da guinada, do jeito que o Transform do runtime guarda. */
export function yawQuaternion(yaw: number): { x: number; y: number; z: number; w: number } {
  const meio = yaw * 0.5;
  return { x: 0, y: Math.sin(meio), z: 0, w: Math.cos(meio) };
}

export function transformToWorld(transform: NodeTransform): WorldPlacement {
  return {
    x: transform.x,
    y: transform.y,
    z: transform.z,
    yaw: transform.yaw * GRAUS,
    sx: transform.sx,
    sy: transform.sy,
    sz: transform.sz,
  };
}
