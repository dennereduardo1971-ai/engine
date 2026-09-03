/**
 * Validação do documento JSON de um glTF — compartilhada entre o glTF em
 * texto (`.gltf`, aqui) e o bloco JSON de dentro de um GLB (`.glb`, ver
 * `glb.ts`). Confere só o que todo glTF 2.0 tem: o campo `asset`. Resolver
 * os `.bin` e texturas externas que um `.gltf` aponta, e montar a cena de
 * verdade, fica para quando o motor 3D souber desenhar um glTF.
 */
export function validarDocumentoGltf(doc: unknown): void {
  if (typeof doc !== 'object' || doc === null || !('asset' in doc)) {
    throw new Error('Faísca: glTF inválido — falta o campo "asset" que todo glTF tem.');
  }
}

/** Valida um `.gltf` — o glTF em texto, JSON puro (sem os `.bin` que ele aponta). */
export function validarGltfTexto(bytes: Uint8Array): void {
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Faísca: glTF inválido — o arquivo não é um JSON válido.');
  }
  validarDocumentoGltf(doc);
}
