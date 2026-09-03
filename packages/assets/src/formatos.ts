import { type AssetKind } from './tipos.ts';

/**
 * Os seis formatos da secao 11 do plano, e o que cada extensao vira.
 *
 * `suportado: false` existe de proposito: a peca reconhece que aquele
 * arquivo e um asset da Faisca, so ainda nao sabe le-lo. Isso separa dois
 * erros bem diferentes para quem arrastou o arquivo — "esse formato nao
 * existe aqui" contra "esse formato ainda esta por vir" — e da um lugar
 * obvio para plugar cada importador que faltar (glTF/GLB, Blender, Tiled,
 * Aseprite) sem mexer no resto do pipeline.
 */
interface FormatoInfo {
  tipo: AssetKind;
  suportado: boolean;
}

const FORMATOS: Record<string, FormatoInfo> = {
  png: { tipo: 'textura', suportado: true },
  wav: { tipo: 'som', suportado: true },
  ogg: { tipo: 'som', suportado: true },
  gltf: { tipo: 'modelo', suportado: false },
  glb: { tipo: 'modelo', suportado: false },
  blend: { tipo: 'modelo', suportado: false },
  tmx: { tipo: 'modelo', suportado: false },
  ase: { tipo: 'textura', suportado: false },
  aseprite: { tipo: 'textura', suportado: false },
};

/** Extensao do caminho, em minusculas e sem o ponto. `''` se nao houver. */
export function extensaoDe(caminho: string): string {
  const nome = caminho.split(/[\\/]/).pop() ?? caminho;
  const ponto = nome.lastIndexOf('.');
  if (ponto <= 0) return '';
  return nome.slice(ponto + 1).toLowerCase();
}

/**
 * Sons e musicas usam as mesmas extensoes (WAV/OGG) — a secao 5 separa as
 * pastas `sons/` e `musicas/`, nao os formatos. Por isso o tipo default de
 * um `.wav`/`.ogg` e `'som'`, e quem importa da pasta `musicas/` passa
 * `tipo: 'musica'` para corrigir.
 */
export function formatoDe(extensao: string): FormatoInfo | null {
  return FORMATOS[extensao] ?? null;
}
