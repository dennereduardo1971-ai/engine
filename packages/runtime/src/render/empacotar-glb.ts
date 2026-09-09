/**
 * Junta um modelo espalhado num único GLB, na memória.
 *
 * Um `.gltf` em texto aponta para o `.bin` dos vértices e para as texturas,
 * cada um num arquivo ao lado. O GLTFLoader do Three.js sabe resolver isso —
 * indo buscar cada URI *na rede*. E o Faísca não tem rede: tem um catálogo
 * de arquivos, que no editor mora na memória do navegador e no jogo
 * publicado mora no pacote. Fazer o loader passar por `fetch` para ler um
 * arquivo que já está na mão seria trocar uma leitura direta por uma volta
 * inteira — com todos os modos de falha que vêm junto.
 *
 * Então o caminho aqui é o contrário: **o modelo é remontado como GLB antes
 * do parse**, com tudo dentro. O loader recebe um único ArrayBuffer, não
 * pede nada a ninguém, e `.gltf` e `.glb` passam a ser exatamente o mesmo
 * caminho de código — o que também é o motivo de isto poder ser testado sem
 * navegador nenhum.
 */

/** Alinha para o múltiplo de 4 seguinte, como o spec do GLB exige. */
function alinhar(n: number): number {
  return (n + 3) & ~3;
}

const TIPOS_DE_IMAGEM: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ktx2: 'image/ktx2',
};

function tipoDaImagem(uri: string): string {
  const extensao = (uri.split('?')[0].split('.').pop() ?? '').toLowerCase();
  return TIPOS_DE_IMAGEM[extensao] ?? 'application/octet-stream';
}

/** Decodifica uma URI `data:...;base64,...`, ou `null` se não for uma. */
function bytesDeDataUri(uri: string): Uint8Array | null {
  if (!uri.startsWith('data:')) return null;
  const virgula = uri.indexOf(',');
  if (virgula < 0) return null;
  const corpo = uri.slice(virgula + 1);
  if (!uri.slice(0, virgula).includes(';base64')) {
    return new TextEncoder().encode(decodeURIComponent(corpo));
  }
  const binario = atob(corpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

interface Referencia {
  uri?: unknown;
  bufferView?: unknown;
  byteOffset?: unknown;
  byteLength?: unknown;
  buffer?: unknown;
  mimeType?: unknown;
}

export interface EntradaParaEmpacotar {
  /** O documento glTF já lido (o `.gltf` inteiro, ou o JSON de um GLB). */
  doc: unknown;
  /** O bloco binário de um GLB de origem, quando havia um. */
  binario?: Uint8Array | null;
  /**
   * Onde achar cada URI externa que o documento cita. Recebe a URI como
   * escrita no arquivo (`"textures/corpo.png"`, `"../comum/atlas.png"`) —
   * resolver isso num caminho de projeto é de quem chama, que é quem sabe
   * de que pasta o modelo veio.
   */
  arquivo: (uri: string) => Uint8Array | null;
}

/**
 * Devolve os bytes de um GLB com o documento e todos os arquivos que ele
 * cita dentro de um único bloco binário.
 *
 * Lança se o documento citar um arquivo que `arquivo` não achar — quem
 * chama já sabe o nome do que faltou e pode dizer isso a quem importou.
 */
export function empacotarGlb({ doc, binario, arquivo }: EntradaParaEmpacotar): Uint8Array {
  const gltf = structuredClone(doc) as Record<string, unknown>;

  const segmentos: { inicio: number; bytes: Uint8Array }[] = [];
  let tamanho = 0;

  /** Põe `bytes` no bloco binário e devolve onde eles começaram. */
  const anexar = (bytes: Uint8Array): number => {
    const inicio = tamanho;
    segmentos.push({ inicio, bytes });
    tamanho = alinhar(tamanho + bytes.length);
    return inicio;
  };

  const bytesDe = (uri: string, ondeAparece: string): Uint8Array => {
    const embutido = bytesDeDataUri(uri);
    if (embutido) return embutido;
    const achado = arquivo(uri);
    if (!achado) {
      throw new Error(`Faísca: o modelo precisa do arquivo "${uri}" (${ondeAparece}).`);
    }
    return achado;
  };

  // 1. Os buffers viram um só. Cada bufferView vai depois somar o
  //    deslocamento do buffer a que ele pertencia.
  const buffers = Array.isArray(gltf.buffers) ? (gltf.buffers as Referencia[]) : [];
  const deslocamento: number[] = [];
  buffers.forEach((buffer, indice) => {
    const uri = buffer.uri;
    if (typeof uri === 'string' && uri.length > 0) {
      deslocamento[indice] = anexar(bytesDe(uri, 'os vértices do modelo'));
    } else if (indice === 0 && binario) {
      deslocamento[indice] = anexar(binario);
    } else {
      throw new Error('Faísca: modelo inválido — um buffer sem arquivo e sem bloco binário.');
    }
  });

  const bufferViews = Array.isArray(gltf.bufferViews) ? (gltf.bufferViews as Referencia[]) : [];
  for (const vista of bufferViews) {
    const original = typeof vista.buffer === 'number' ? vista.buffer : 0;
    vista.byteOffset =
      (typeof vista.byteOffset === 'number' ? vista.byteOffset : 0) + (deslocamento[original] ?? 0);
    vista.buffer = 0;
  }

  // 2. Cada textura externa vira um bufferView novo. O `mimeType` passa a ser
  //    obrigatório: sem a extensão do arquivo, é ele que diz o que é aquilo.
  const images = Array.isArray(gltf.images) ? (gltf.images as Referencia[]) : [];
  for (const imagem of images) {
    const uri = imagem.uri;
    if (typeof uri !== 'string' || uri.length === 0) continue;
    const bytes = bytesDe(uri, 'uma textura');
    const inicio = anexar(bytes);
    bufferViews.push({ buffer: 0, byteOffset: inicio, byteLength: bytes.length });
    imagem.bufferView = bufferViews.length - 1;
    imagem.mimeType = imagem.mimeType ?? tipoDaImagem(uri);
    delete imagem.uri;
  }
  if (bufferViews.length > 0) gltf.bufferViews = bufferViews;

  gltf.buffers = [{ byteLength: tamanho }];

  // 3. Costura o GLB: cabeçalho, bloco JSON, bloco BIN.
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  if (alinhar(json.length) !== json.length) {
    const comEspacos = new Uint8Array(alinhar(json.length)).fill(0x20);
    comEspacos.set(json);
    json = comEspacos;
  }

  const temBinario = tamanho > 0;
  const total = 12 + 8 + json.length + (temBinario ? 8 + tamanho : 0);
  const saida = new Uint8Array(total);
  const vista = new DataView(saida.buffer);
  vista.setUint32(0, 0x46546c67, true); // "glTF"
  vista.setUint32(4, 2, true);
  vista.setUint32(8, total, true);
  vista.setUint32(12, json.length, true);
  vista.setUint32(16, 0x4e4f534a, true); // "JSON"
  saida.set(json, 20);

  if (temBinario) {
    const inicioBin = 20 + json.length;
    vista.setUint32(inicioBin, tamanho, true);
    vista.setUint32(inicioBin + 4, 0x004e4942, true); // "BIN\0"
    const dados = inicioBin + 8;
    for (const segmento of segmentos) saida.set(segmento.bytes, dados + segmento.inicio);
  }

  return saida;
}
