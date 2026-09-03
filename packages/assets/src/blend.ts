/**
 * Validação mínima de um `.blend` (Blender) — confere a assinatura do
 * arquivo, sem entrar nos "DNA blocks" internos (formato próprio do
 * Blender, versão a versão) — isso é trabalho de importar a cena de
 * verdade, que fica para quando o motor souber ler malhas do Blender.
 *
 * Um `.blend` sem compressão começa com o texto "BLENDER"; um `.blend`
 * comprimido (opção do Blender ao salvar) começa com a assinatura gzip.
 * Os dois são aceitos aqui como "é um .blend de verdade" — descomprimir o
 * gzip para checar o "BLENDER" por dentro não muda a decisão de aceitar.
 */
const ASSINATURA = new TextEncoder().encode('BLENDER');
const ASSINATURA_GZIP = new Uint8Array([0x1f, 0x8b]);

function comecaCom(bytes: Uint8Array, prefixo: Uint8Array): boolean {
  if (bytes.length < prefixo.length) return false;
  for (let i = 0; i < prefixo.length; i++) {
    if (bytes[i] !== prefixo[i]) return false;
  }
  return true;
}

/** Lança se `bytes` não for um `.blend` válido; não faz nada em caso de sucesso. */
export function validarBlend(bytes: Uint8Array): void {
  if (comecaCom(bytes, ASSINATURA_GZIP)) return; // .blend comprimido
  if (!comecaCom(bytes, ASSINATURA)) {
    throw new Error('Faísca: .blend inválido — não começa com a assinatura "BLENDER".');
  }
}
