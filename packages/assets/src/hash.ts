/**
 * Hash de conteudo, puro TypeScript sem `node:crypto`.
 *
 * O pacote roda tanto no editor (navegador, arrastar-e-soltar um arquivo)
 * quanto em testes (Node) — por isso nada aqui pode depender de um modulo
 * nativo do Node. FNV-1a de 32 bits nao serve para seguranca, mas o unico
 * uso dele e "esse arquivo e igual ao que eu importei da ultima vez?", e
 * para isso ele e rapido e sobra.
 */
export function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
