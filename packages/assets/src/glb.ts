/**
 * Leitura da casca de um GLB (glTF binário) — seção 11.
 *
 * Um GLB é um cabeçalho de 12 bytes e uma fila de blocos: o primeiro é o
 * JSON do glTF, e o segundo (quando existe) é o binário com vértices e
 * texturas embutidas. Este módulo abre essa casca e confere que ela é mesmo
 * um GLB — assinatura, tamanho batendo com o cabeçalho, e um JSON com o
 * campo `asset` que todo glTF 2.0 tem (`validarDocumentoGltf`, a mesma
 * regra usada pelo `.gltf` em texto).
 *
 * Ele não monta a cena: quem transforma isto num objeto na tela é o
 * `CarregadorDeModelos` do `@faisca/runtime`, que é o lado que sabe de
 * Three.js. Aqui é só o suficiente para separar "arquivo bom" de "arquivo
 * corrompido ou não é isso" antes de aceitar no catálogo, e para dizer de
 * que outros arquivos o modelo precisa (ver `dependencias.ts`).
 */
import { validarDocumentoGltf } from './gltf.ts';

const ASSINATURA = 0x46546c67; // "glTF" em little-endian
const TIPO_JSON = 0x4e4f534a; // "JSON" em little-endian
const TIPO_BIN = 0x004e4942; // "BIN\0" em little-endian
const TAMANHO_CABECALHO = 12;
const TAMANHO_CABECALHO_CHUNK = 8;

export interface BlocosDoGlb {
  /** O documento glTF do primeiro bloco, já validado. */
  json: unknown;
  /** O bloco binário, ou `null` num GLB que só tem o JSON. */
  binario: Uint8Array | null;
}

/**
 * Abre um GLB em seus blocos.
 *
 * Existe separado de `validarGlb` porque quem vai *abrir* o modelo — o
 * carregador do runtime, a busca de dependências — precisa do conteúdo, e
 * não só do veredito; ler os blocos duas vezes seria pagar o parse de novo.
 */
export function blocosDoGlb(bytes: Uint8Array): BlocosDoGlb {
  if (bytes.length < TAMANHO_CABECALHO + TAMANHO_CABECALHO_CHUNK) {
    throw new Error('Faísca: GLB inválido — arquivo curto demais para ter um cabeçalho.');
  }

  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (vista.getUint32(0, true) !== ASSINATURA) {
    throw new Error('Faísca: GLB inválido — o arquivo não começa com a assinatura "glTF".');
  }

  const tamanhoTotal = vista.getUint32(8, true);
  if (tamanhoTotal > bytes.length) {
    throw new Error('Faísca: GLB inválido — o arquivo está truncado.');
  }

  const tamanhoChunk = vista.getUint32(TAMANHO_CABECALHO, true);
  const tipoChunk = vista.getUint32(TAMANHO_CABECALHO + 4, true);
  if (tipoChunk !== TIPO_JSON) {
    throw new Error('Faísca: GLB inválido — o primeiro bloco deveria ser o JSON do glTF.');
  }

  const inicioJson = TAMANHO_CABECALHO + TAMANHO_CABECALHO_CHUNK;
  const fimJson = inicioJson + tamanhoChunk;
  if (fimJson > bytes.length) {
    throw new Error('Faísca: GLB inválido — o bloco JSON está truncado.');
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(inicioJson, fimJson)));
  } catch {
    throw new Error('Faísca: GLB inválido — o bloco JSON não é um JSON válido.');
  }
  try {
    validarDocumentoGltf(json);
  } catch {
    throw new Error('Faísca: GLB inválido — falta o campo "asset" que todo glTF tem.');
  }

  return { json, binario: binarioApos(bytes, vista, fimJson) };
}

/**
 * O primeiro bloco `BIN` depois do JSON. Percorre os blocos em vez de
 * assumir que ele é o segundo: o spec permite blocos desconhecidos no meio,
 * e quem não conhece um bloco deve pulá-lo, não desistir.
 */
function binarioApos(bytes: Uint8Array, vista: DataView, inicio: number): Uint8Array | null {
  let cursor = inicio;
  while (cursor + TAMANHO_CABECALHO_CHUNK <= bytes.length) {
    const tamanho = vista.getUint32(cursor, true);
    const tipo = vista.getUint32(cursor + 4, true);
    const dados = cursor + TAMANHO_CABECALHO_CHUNK;
    if (dados + tamanho > bytes.length) return null; // bloco truncado: sem binário
    if (tipo === TIPO_BIN) return bytes.subarray(dados, dados + tamanho);
    cursor = dados + tamanho;
  }
  return null;
}

/** O documento JSON de dentro de um GLB, já validado. */
export function jsonDoGlb(bytes: Uint8Array): unknown {
  return blocosDoGlb(bytes).json;
}

/** Lança se `bytes` não for um GLB válido; não faz nada em caso de sucesso. */
export function validarGlb(bytes: Uint8Array): void {
  blocosDoGlb(bytes);
}
