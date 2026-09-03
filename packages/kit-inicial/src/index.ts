import { importarAsset, type AssetMeta } from '@faisca/assets';
import { tomWav } from './audio.ts';
import { pngQuadradoSolido, type Cor } from './imagem.ts';

export { pngQuadradoSolido, tomWav };

/** Um item do kit: os metadados que o importador gera, e os bytes crus. */
export interface AssetDoKit {
  asset: AssetMeta;
  bytes: Uint8Array;
}

interface ItemDoKit {
  caminho: string;
  gerar: () => Uint8Array;
}

// Cores da paleta da Faisca (secao 2/9 do plano nao fecha uma paleta ainda;
// estas sao provisorias, so para os placeholders nao saírem todos cinzas).
const LARANJA: Cor = [255, 122, 41, 255];
const AMARELO: Cor = [255, 214, 61, 255];
const CINZA: Cor = [110, 118, 130, 255];

/**
 * O kit inicial (secao 11 do plano): "personagens, peças de pista, sons e
 * músicas, com licença livre" — já instalado, sem o pai ou a mãe terem que
 * importar nada no primeiro uso.
 *
 * Isto NÃO é a arte final. É um placeholder gerado por código: um
 * quadrado solido para cada personagem/peça, um tom puro para cada som.
 * Ele existe para o pipeline de importação (`@faisca/assets`) ter algo de
 * verdade para importar desde já, e para nenhuma fase ficar muda ou
 * invisível enquanto a arte licenciada não chega. Trocar por arte de
 * verdade é so substituir `gerar` por um arquivo lido do disco — o
 * `caminho` de cada item já é onde ele vai morar dentro de `assets/`.
 */
const ITENS: ItemDoKit[] = [
  { caminho: 'assets/texturas/heroi.png', gerar: () => pngQuadradoSolido(LARANJA, 16) },
  { caminho: 'assets/texturas/moeda.png', gerar: () => pngQuadradoSolido(AMARELO, 8) },
  { caminho: 'assets/texturas/plataforma.png', gerar: () => pngQuadradoSolido(CINZA, 16) },
  { caminho: 'assets/sons/pulo.wav', gerar: () => tomWav(660, 0.12) },
  { caminho: 'assets/sons/moeda.wav', gerar: () => tomWav(990, 0.1) },
  { caminho: 'assets/musicas/hub.wav', gerar: () => tomWav(220, 1.5) },
];

/** Gera o kit inicial inteiro, já passado pelo importador de verdade. */
export function kitInicial(): AssetDoKit[] {
  return ITENS.map(({ caminho, gerar }) => {
    const bytes = gerar();
    return { asset: importarAsset(caminho, bytes), bytes };
  });
}
