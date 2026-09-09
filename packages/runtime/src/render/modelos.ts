import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { blocosDoGlb, dependenciasDeModelo, pastaDe, resolverCaminho } from '@faisca/assets';
import { empacotarGlb } from './empacotar-glb.ts';

/**
 * Carregar modelo 3D: de bytes no catalogo a objeto na cena.
 *
 * Ate aqui o `@faisca/assets` sabia dizer se um `.glb`/`.gltf` era um modelo
 * de verdade, e mais nada — quem desenha e este pacote (secao 4: o runtime e
 * quem vai dentro do jogo publicado). Este modulo fecha esse buraco.
 *
 * Duas coisas dao trabalho, e as duas moram aqui:
 *
 * 1. **Um `.gltf` nunca vem sozinho.** Ele aponta para o `.bin` dos vertices
 *    e para as texturas, em caminhos relativos a pasta dele — e o Three.js
 *    resolveria isso indo buscar cada URI na rede, que o Faisca nao tem. A
 *    saida e remontar o modelo como um GLB unico antes do parse
 *    (`empacotar-glb.ts`): o loader recebe tudo pronto e nao pede nada a
 *    ninguem.
 * 2. **O modelo que a crianca baixou nao tem o tamanho do jogo.** Um modelo
 *    de banco de modelos costuma vir em centimetros, deitado, e com o pe
 *    longe da origem. `alturaAlvo` e `assentar` resolvem isso na importacao,
 *    e nao pedindo para alguem acertar tres numeros no inspetor.
 */

/** De onde saem os bytes de um caminho do projeto. `null` = nao existe. */
export type FonteDeArquivos = (caminho: string) => Promise<Uint8Array | null>;

export interface OpcoesDeModelo {
  /**
   * Reescala o modelo inteiro (uniforme) para ter esta altura em unidades de
   * mundo. Uniforme de proposito: esticar so um eixo deforma o personagem.
   */
  alturaAlvo?: number;
  /**
   * Centra em X/Z e poe a base em Y=0. E o que faz um modelo "ficar em pe no
   * chao" quando alguem larga ele numa peca, em vez de metade enterrado.
   */
  assentar?: boolean;
}

/** Um modelo ja lido, pronto para virar quantas copias a cena precisar. */
export interface Modelo {
  readonly caminho: string;
  /** Animacoes que vieram no arquivo (vazio na maioria dos modelos). */
  readonly animacoes: readonly THREE.AnimationClip[];
  /** Caixa que envolve o modelo depois da normalizacao. */
  readonly caixa: THREE.Box3;
  /**
   * Uma copia nova para pendurar na cena. Geometrias e materiais sao
   * compartilhados entre as copias — dez inimigos iguais nao sao dez malhas
   * na memoria da GPU.
   */
  instanciar(): THREE.Object3D;
}

const EXTENSOES = new Set(['glb', 'gltf']);

/**
 * Um loader so para todo mundo. Ele nao guarda estado entre chamadas — e
 * como tudo chega empacotado, ele tambem nunca sai para buscar nada — entao
 * um por carregamento seria so lixo a mais para o coletor.
 */
const LOADER = new GLTFLoader();

function extensao(caminho: string): string {
  const nome = caminho.split(/[\\/]/).pop() ?? caminho;
  const ponto = nome.lastIndexOf('.');
  return ponto <= 0 ? '' : nome.slice(ponto + 1).toLowerCase();
}

/**
 * Poe o modelo de pe, do tamanho pedido, com o pe no chao.
 *
 * A escala vai num objeto que envolve o modelo, e nao nos vertices: assim a
 * malha continua sendo a mesma que o cache empresta as outras copias, e o
 * colisor sai depois com a matriz ja aplicada (ver `malhaDeColisao`).
 */
function normalizar(raiz: THREE.Object3D, opcoes: OpcoesDeModelo): THREE.Object3D {
  const alturaAlvo = opcoes.alturaAlvo;
  const assentar = opcoes.assentar ?? false;
  if (alturaAlvo === undefined && !assentar) return raiz;

  const envolucro = new THREE.Group();
  envolucro.name = raiz.name || 'modelo';
  envolucro.add(raiz);

  raiz.updateWorldMatrix(false, true);
  const caixa = new THREE.Box3().setFromObject(raiz);
  if (caixa.isEmpty()) return envolucro;

  if (alturaAlvo !== undefined && alturaAlvo > 0) {
    const altura = caixa.max.y - caixa.min.y;
    // Um modelo achatado (altura zero) nao tem por onde ser reescalado por
    // altura — deixar como esta e melhor que dividir por zero.
    if (altura > 1e-6) {
      const fator = alturaAlvo / altura;
      raiz.scale.multiplyScalar(fator);
      raiz.updateWorldMatrix(false, true);
      caixa.setFromObject(raiz);
    }
  }

  if (assentar) {
    const centro = caixa.getCenter(new THREE.Vector3());
    raiz.position.x -= centro.x;
    raiz.position.z -= centro.z;
    raiz.position.y -= caixa.min.y;
  }

  envolucro.updateWorldMatrix(false, true);
  return envolucro;
}

function temEsqueleto(raiz: THREE.Object3D): boolean {
  let achou = false;
  raiz.traverse((filho) => {
    if ((filho as THREE.SkinnedMesh).isSkinnedMesh) achou = true;
  });
  return achou;
}

/**
 * A malha de colisao de um objeto ja montado, no espaco local dele.
 *
 * Junta todas as malhas descendentes numa lista so de vertices e indices, com
 * a matriz de cada uma ja aplicada — que e exatamente o que o Rapier quer de
 * um colisor de malha, e o que a peca desenhada ja fazia com a geometria dela
 * (`scaledTrimesh`, em `@faisca/autoria`). Assim a promessa "o que se ve e o
 * que se colide" vale tambem para um modelo importado, e nao so para as pecas
 * de fabrica.
 */
export function malhaDeColisao(
  raiz: THREE.Object3D,
): { vertices: Float32Array; indices: Uint32Array } | null {
  raiz.updateWorldMatrix(false, true);
  const inversaDaRaiz = raiz.matrixWorld.clone().invert();
  const vertices: number[] = [];
  const indices: number[] = [];
  const ponto = new THREE.Vector3();
  const paraLocal = new THREE.Matrix4();

  raiz.traverse((filho) => {
    const malha = filho as THREE.Mesh;
    if (!malha.isMesh) return;
    const posicoes = malha.geometry?.getAttribute('position');
    if (!posicoes) return;

    const base = vertices.length / 3;
    paraLocal.multiplyMatrices(inversaDaRaiz, malha.matrixWorld);
    for (let i = 0; i < posicoes.count; i++) {
      ponto.fromBufferAttribute(posicoes as THREE.BufferAttribute, i).applyMatrix4(paraLocal);
      vertices.push(ponto.x, ponto.y, ponto.z);
    }

    const index = malha.geometry.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    } else {
      // Sem indice, os vertices ja estao em ordem de triangulo.
      for (let i = 0; i < posicoes.count; i++) indices.push(base + i);
    }
  });

  if (indices.length === 0) return null;
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/**
 * Le modelos de um catalogo de arquivos, uma vez por caminho.
 *
 * O cache guarda a *promessa*, e nao o resultado: duas pecas que apontam para
 * o mesmo modelo, criadas no mesmo quadro, leem o arquivo uma vez so.
 */
export class CarregadorDeModelos {
  private readonly cache = new Map<string, Promise<Modelo>>();

  constructor(private readonly fonte: FonteDeArquivos) {}

  /**
   * Le (ou reaproveita) o modelo em `caminho`. As opcoes fazem parte da
   * chave do cache: o mesmo arquivo com alturas diferentes sao dois modelos.
   */
  carregar(caminho: string, opcoes: OpcoesDeModelo = {}): Promise<Modelo> {
    const chave = `${caminho}|${opcoes.alturaAlvo ?? ''}|${opcoes.assentar ? 'a' : ''}`;
    const guardado = this.cache.get(chave);
    if (guardado) return guardado;
    const promessa = this.ler(caminho, opcoes).catch((erro: unknown) => {
      // Um erro nao fica preso no cache: o arquivo pode chegar na proxima
      // sincronizacao da pasta, e a peca tem que poder tentar de novo.
      this.cache.delete(chave);
      throw erro;
    });
    this.cache.set(chave, promessa);
    return promessa;
  }

  /** Esquece o que foi lido de `caminho` — o arquivo mudou no disco. */
  invalidar(caminho: string): void {
    for (const chave of [...this.cache.keys()]) {
      if (chave.slice(0, chave.indexOf('|')) === caminho) this.cache.delete(chave);
    }
  }

  /** Esquece tudo. */
  limpar(): void {
    this.cache.clear();
  }

  private async ler(caminho: string, opcoes: OpcoesDeModelo): Promise<Modelo> {
    if (!EXTENSOES.has(extensao(caminho))) {
      throw new Error(
        `Faísca: "${caminho}" não é um modelo 3D que eu saiba abrir. Use .glb ou .gltf.`,
      );
    }

    const bytes = await this.fonte(caminho);
    if (!bytes) {
      throw new Error(`Faísca: não achei o arquivo "${caminho}" para abrir o modelo.`);
    }

    // As dependencias sao lidas antes do parse e entram no proprio arquivo:
    // o loader recebe um GLB completo, e nao uma lista de coisas para ir
    // buscar (ver `empacotar-glb.ts`).
    const base = pastaDe(caminho);
    const arquivos = new Map<string, Uint8Array>();
    for (const dependencia of dependenciasDeModelo(caminho, bytes)) {
      const conteudo = await this.fonte(dependencia);
      if (!conteudo) {
        throw new Error(
          `Faísca: o modelo "${caminho}" precisa do arquivo "${dependencia}", que não está ` +
            'no projeto. Importe a pasta inteira do modelo, e não só o .gltf.',
        );
      }
      arquivos.set(dependencia, conteudo);
    }

    // O empacotador fala em URIs do documento; o catalogo fala em caminhos
    // do projeto. A traducao entre os dois e uma linha, e mora aqui porque e
    // aqui que se sabe de que pasta o modelo veio.
    const achar = (uri: string): Uint8Array | null =>
      arquivos.get(resolverCaminho(base, decodeURIComponent(uri))) ?? null;

    const ehGlb = extensao(caminho) === 'glb';
    const bruto = ehGlb ? blocosDoGlb(bytes) : { json: JSON.parse(new TextDecoder().decode(bytes)) as unknown, binario: null };
    const glb =
      ehGlb && arquivos.size === 0
        ? bytes.slice() // GLB com tudo dentro: ja e o que o loader quer
        : empacotarGlb({ doc: bruto.json, binario: bruto.binario, arquivo: achar });

    const gltf = await new Promise<GLTF>((resolve, reject) => {
      LOADER.parse(glb.buffer as ArrayBuffer, base, resolve, reject);
    });

    const raiz = normalizar(gltf.scene, opcoes);
    const skinado = temEsqueleto(raiz);
    const caixa = new THREE.Box3().setFromObject(raiz);

    return {
      caminho,
      animacoes: gltf.animations ?? [],
      caixa,
      instanciar: () => (skinado ? cloneComEsqueleto(raiz) : raiz.clone(true)),
    };
  }
}
