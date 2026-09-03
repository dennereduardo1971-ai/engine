/**
 * Validação mínima de um arquivo Aseprite (`.ase`/`.aseprite`) — confere a
 * assinatura do cabeçalho (0xA5E0, fixa pelo formato) e que o tamanho
 * declarado no arquivo bate com o que foi lido. Ler quadros, camadas e
 * paleta de verdade fica para quando o editor souber desenhar sprites com
 * animação quadro a quadro.
 */
const TAMANHO_CABECALHO = 128;
const ASSINATURA = 0xa5e0;

/** Lança se `bytes` não for um Aseprite válido; não faz nada em caso de sucesso. */
export function validarAse(bytes: Uint8Array): void {
  if (bytes.length < TAMANHO_CABECALHO) {
    throw new Error('Faísca: Aseprite inválido — arquivo curto demais para ter um cabeçalho.');
  }
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tamanhoArquivo = vista.getUint32(0, true);
  const assinatura = vista.getUint16(4, true);
  if (assinatura !== ASSINATURA) {
    throw new Error('Faísca: Aseprite inválido — a assinatura do cabeçalho não bate.');
  }
  if (tamanhoArquivo !== bytes.length) {
    throw new Error('Faísca: Aseprite inválido — o tamanho declarado não bate com o arquivo.');
  }
}
