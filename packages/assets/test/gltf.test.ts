import { describe, expect, it } from 'vitest';
import { validarGltfTexto } from '../src/index.ts';

function bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

describe('validarGltfTexto', () => {
  it('aceita um glTF bem formado', () => {
    expect(() => validarGltfTexto(bytes(JSON.stringify({ asset: { version: '2.0' } })))).not.toThrow();
  });

  it('recusa um arquivo que nao e JSON valido', () => {
    expect(() => validarGltfTexto(bytes('{ nao'))).toThrow(/não é um JSON válido/);
  });

  it('recusa um JSON sem o campo "asset"', () => {
    expect(() => validarGltfTexto(bytes(JSON.stringify({ meshes: [] })))).toThrow(/campo "asset"/);
  });
});
