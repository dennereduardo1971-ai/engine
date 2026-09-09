import { validarAse } from './ase.ts';
import { validarBlend } from './blend.ts';
import { dependenciasDeModelo } from './dependencias.ts';
import { extensaoDe, formatoDe } from './formatos.ts';
import { validarGlb } from './glb.ts';
import { validarGltfTexto } from './gltf.ts';
import { hashBytes } from './hash.ts';
import { validarTmx } from './tmx.ts';
import { type AssetKind, type AssetMeta } from './tipos.ts';

export interface OpcoesImportar {
  /** Sobrescreve o tipo inferido da extensao (uso: `.wav` dentro de `musicas/`). */
  tipo?: AssetKind;
  /** Injetavel em teste; padrao `Date.now()`. */
  agora?: () => number;
}

/**
 * Importa um asset a partir dos bytes do arquivo.
 *
 * Recebe bytes, e nao um `File` do navegador ou um caminho de disco do
 * Node: e o que os dois mundos tem em comum, e e por isso que este pacote
 * consegue ser testado com Vitest (Node) e usado dentro do editor
 * (navegador) sem duas implementacoes. Quem chama — o "arrastar" do
 * editor, ou um teste — resolve o arquivo em bytes antes de chegar aqui.
 */
export function importarAsset(
  caminho: string,
  bytes: Uint8Array,
  opcoes: OpcoesImportar = {},
): AssetMeta {
  const extensao = extensaoDe(caminho);
  const info = formatoDe(extensao);

  if (!info) {
    throw new Error(
      `Faísca: não reconheço o formato ".${extensao || '?'}". Formatos aceitos: PNG, ` +
        'Aseprite, glTF/GLB, Blender, Tiled, WAV e OGG.',
    );
  }
  if (!info.suportado) {
    throw new Error(
      `Faísca: arquivos ".${extensao}" ainda não têm importação automática. Por enquanto, ` +
        'use PNG para imagens e WAV ou OGG para sons e músicas.',
    );
  }

  // Cada formato suportado tem uma checagem estrutural propria (assinatura,
  // cabecalho ou tag raiz) — ver o modulo de cada um.
  if (extensao === 'glb') validarGlb(bytes);
  else if (extensao === 'gltf') validarGltfTexto(bytes);
  else if (extensao === 'tmx') validarTmx(bytes);
  else if (extensao === 'ase' || extensao === 'aseprite') validarAse(bytes);
  else if (extensao === 'blend') validarBlend(bytes);

  // Um `.gltf` (e, mais raro, um `.glb`) pode apontar para arquivos ao lado.
  // Quem importa precisa saber disso na hora, para pedir o resto antes de o
  // modelo abrir vazio — ver `dependencias.ts`.
  const dependencias = dependenciasDeModelo(caminho, bytes);

  const agora = opcoes.agora ?? Date.now;
  return {
    caminho,
    tipo: opcoes.tipo ?? info.tipo,
    formato: extensao,
    hash: hashBytes(bytes),
    tamanho: bytes.length,
    importadoEm: agora(),
    ...(dependencias.length > 0 ? { dependencias } : {}),
  };
}
