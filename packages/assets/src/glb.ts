/**
 * Validação mínima de um GLB (glTF binário) — seção 11.
 *
 * Não monta a cena (isso é trabalho do motor 3D, que ainda não sabe
 * desenhar um glTF): só confere que o arquivo é mesmo um GLB — assinatura,
 * tamanho batendo com o cabeçalho, e um primeiro bloco JSON com o campo
 * `asset` que todo glTF 2.0 tem (checado por `validarDocumentoGltf`, a
 * mesma regra usada pelo `.gltf` em texto). É o suficiente para separar
 * "arquivo bom" de "arquivo corrompido ou não é isso" antes de aceitar no
 * catálogo.
 */
import { validarDocumentoGltf } from './gltf.ts';

const ASSINATURA = 0x46546c67; // "glTF" em little-endian
const TIPO_JSON = 0x4e4f534a; // "JSON" em little-endian
const TAMANHO_CABECALHO = 12;
const TAMANHO_CABECALHO_CHUNK = 8;

/** Lança se `bytes` não for um GLB válido; não faz nada em caso de sucesso. */
export function validarGlb(bytes: Uint8Array): void {
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

  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder().decode(bytes.subarray(inicioJson, fimJson)));
  } catch {
    throw new Error('Faísca: GLB inválido — o bloco JSON não é um JSON válido.');
  }
  try {
    validarDocumentoGltf(doc);
  } catch {
    throw new Error('Faísca: GLB inválido — falta o campo "asset" que todo glTF tem.');
  }
}
