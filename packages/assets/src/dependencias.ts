/**
 * De que outros arquivos um modelo precisa para abrir.
 *
 * Um `.gltf` em texto quase nunca vem sozinho: ele aponta para um `.bin`
 * com os vertices e para as texturas, cada um num caminho relativo a pasta
 * do proprio `.gltf`. Importar so o `.gltf` e ficar com um modelo que abre
 * vazio e a decepcao classica de quem arrasta um modelo para dentro de um
 * editor — entao o importador precisa saber, antes de aceitar, o que mais
 * falta pedir.
 *
 * Isto e a parte pura: le o JSON do modelo (o `.gltf` inteiro, ou o bloco
 * JSON de dentro de um `.glb`) e devolve os caminhos, ja resolvidos em
 * relacao a pasta do modelo. Quem le disco ou `File` do navegador — o
 * editor, o carregador do runtime — usa esta lista para buscar o resto.
 *
 * URIs `data:` ficam de fora de proposito: elas ja *sao* o conteudo, nao um
 * arquivo a procurar.
 */
import { jsonDoGlb } from './glb.ts';
import { extensaoDe } from './formatos.ts';

/** Pasta de `caminho`, com a barra final, ou `''` se o arquivo estiver na raiz. */
export function pastaDe(caminho: string): string {
  const corte = caminho.replace(/\\/g, '/').lastIndexOf('/');
  return corte < 0 ? '' : caminho.slice(0, corte + 1);
}

/**
 * Junta `base` (uma pasta, com barra final) e `relativo`, resolvendo `./` e
 * `../`. Nao existe `URL` aqui de proposito: os caminhos do projeto sao
 * caminhos de dentro de `assets/`, e nao endereços — passar por `URL` faria
 * um `..` a mais virar `http://` de algum lugar.
 */
export function resolverCaminho(base: string, relativo: string): string {
  if (relativo.startsWith('/')) return relativo.slice(1);
  const partes = (base + relativo).replace(/\\/g, '/').split('/');
  const pilha: string[] = [];
  for (const parte of partes) {
    if (parte === '' || parte === '.') continue;
    if (parte === '..') pilha.pop();
    else pilha.push(parte);
  }
  return pilha.join('/');
}

/** Uma URI que aponta para outro arquivo (e nao para o proprio conteudo). */
function ehArquivoExterno(uri: unknown): uri is string {
  return typeof uri === 'string' && uri.length > 0 && !uri.startsWith('data:');
}

function urisDoDocumento(doc: unknown): string[] {
  if (typeof doc !== 'object' || doc === null) return [];
  const uris: string[] = [];
  for (const chave of ['buffers', 'images'] as const) {
    const lista = (doc as Record<string, unknown>)[chave];
    if (!Array.isArray(lista)) continue;
    for (const item of lista) {
      if (typeof item !== 'object' || item === null) continue;
      const uri = (item as { uri?: unknown }).uri;
      if (ehArquivoExterno(uri)) uris.push(decodeURIComponent(uri));
    }
  }
  return uris;
}

/**
 * Os arquivos que `caminho` precisa, em caminhos do projeto (ja relativos a
 * `assets/`, como o resto do catalogo). Sem repeticoes e na ordem em que
 * aparecem. Um formato que nao seja glTF/GLB — ou um GLB com tudo dentro,
 * que e o caso comum — devolve lista vazia.
 */
export function dependenciasDeModelo(caminho: string, bytes: Uint8Array): string[] {
  const extensao = extensaoDe(caminho);
  let doc: unknown;
  if (extensao === 'glb') {
    doc = jsonDoGlb(bytes);
  } else if (extensao === 'gltf') {
    try {
      doc = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return [];
    }
  } else {
    return [];
  }

  const base = pastaDe(caminho);
  const vistos = new Set<string>();
  for (const uri of urisDoDocumento(doc)) vistos.add(resolverCaminho(base, uri));
  return [...vistos];
}
