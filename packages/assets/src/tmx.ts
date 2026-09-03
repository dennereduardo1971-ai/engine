/**
 * Validação mínima de um mapa Tiled (`.tmx`) — XML, mas lido sem parser de
 * XML (o pacote não tem DOMParser fora do navegador, e não vale a pena
 * trazer um parser XML só para isso): confere que existe uma tag `<map>`
 * com os atributos que todo mapa Tiled tem, sem montar a árvore de camadas
 * e tiles (isso é trabalho de quem for desenhar a fase).
 */
const ATRIBUTOS_OBRIGATORIOS = ['width', 'height', 'tilewidth', 'tileheight'] as const;

/** Lança se `bytes` não for um `.tmx` válido; não faz nada em caso de sucesso. */
export function validarTmx(bytes: Uint8Array): void {
  const texto = new TextDecoder().decode(bytes);
  const tagMap = /<map\b[^>]*>/.exec(texto);
  if (!tagMap) {
    throw new Error('Faísca: TMX inválido — não encontrei a tag "<map>".');
  }
  for (const atributo of ATRIBUTOS_OBRIGATORIOS) {
    const valor = new RegExp(`[\\s"]${atributo}="(\\d+)"`).exec(tagMap[0]);
    if (!valor) {
      throw new Error(`Faísca: TMX inválido — falta o atributo "${atributo}" em "<map>".`);
    }
  }
}
