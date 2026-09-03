/**
 * Modelo de dados de um asset importado.
 *
 * A secao 5 do plano diz onde cada tipo mora dentro de `assets/`:
 * `modelos/ texturas/ sons/ musicas/ fontes/`. `AssetKind` e essa mesma
 * lista, sem a fonte por enquanto — nenhum dos seis formatos da secao 11
 * (PNG, Aseprite, glTF/GLB, Blender, Tiled, WAV/OGG) e uma fonte, entao
 * o importador nao teria como reconhecer uma ainda.
 */
export type AssetKind = 'textura' | 'modelo' | 'som' | 'musica';

/**
 * Metadados de um asset depois de importado.
 *
 * `caminho` e a chave: e o lugar dentro de `assets/` que a peca ou o
 * material aponta, e por isso e ele — nao um id gerado — que identifica o
 * asset no catalogo (secao 11: reimport automatico e re-ler o mesmo
 * caminho quando o arquivo debaixo dele muda).
 */
export interface AssetMeta {
  /** Caminho do arquivo dentro do projeto, ex.: `assets/texturas/heroi.png`. */
  caminho: string;
  tipo: AssetKind;
  /** Extensao reconhecida, em minusculas e sem o ponto (`"png"`, `"wav"`). */
  formato: string;
  /** Hash do conteudo — nao criptografico, so serve para saber se mudou. */
  hash: string;
  /** Tamanho do arquivo em bytes. */
  tamanho: number;
  /** Quando foi importado (`Date.now()` por padrao, injetavel em teste). */
  importadoEm: number;
}
