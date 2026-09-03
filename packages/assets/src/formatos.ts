import { type AssetKind } from './tipos.ts';

/**
 * Os seis formatos da secao 11 do plano, e o que cada extensao vira.
 *
 * Todos os seis ja tem validacao estrutural real (assinatura, cabecalho ou
 * tag raiz — ver `glb.ts`, `gltf.ts`, `blend.ts`, `tmx.ts`, `ase.ts`), nao
 * so reconhecimento de extensao. `suportado: false` continua existindo
 * como campo — e o lugar obvio para um formato novo que entre reconhecido
 * mas sem leitura ainda, separando "esse formato nao existe aqui" de "esse
 * formato ainda esta por vir" — so que nenhum dos seis atuais usa mais
 * esse caminho.
 */
interface FormatoInfo {
  tipo: AssetKind;
  suportado: boolean;
}

const FORMATOS: Record<string, FormatoInfo> = {
  png: { tipo: 'textura', suportado: true },
  wav: { tipo: 'som', suportado: true },
  ogg: { tipo: 'som', suportado: true },
  gltf: { tipo: 'modelo', suportado: true },
  glb: { tipo: 'modelo', suportado: true },
  blend: { tipo: 'modelo', suportado: true },
  tmx: { tipo: 'modelo', suportado: true },
  ase: { tipo: 'textura', suportado: true },
  aseprite: { tipo: 'textura', suportado: true },
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
