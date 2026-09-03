import { describe, expect, it } from 'vitest';
import { validarGlb } from '../src/index.ts';

/** Monta um GLB minimo mas valido: cabecalho + um unico chunk JSON. */
function glbValido(json: unknown = { asset: { version: '2.0' } }): Uint8Array {
  const jsonTexto = JSON.stringify(json);
  let jsonBytes = new TextEncoder().encode(jsonTexto);
  // Chunks JSON sao preenchidos com espaco ate multiplo de 4, como o spec pede.
  const preenchido = (jsonBytes.length + 3) & ~3;
  if (preenchido !== jsonBytes.length) {
    const comEspacos = new Uint8Array(preenchido).fill(0x20);
    comEspacos.set(jsonBytes);
    jsonBytes = comEspacos;
  }

  const tamanhoTotal = 12 + 8 + jsonBytes.length;
  const bytes = new Uint8Array(tamanhoTotal);
  const vista = new DataView(bytes.buffer);
  vista.setUint32(0, 0x46546c67, true); // "glTF"
  vista.setUint32(4, 2, true); // versao
  vista.setUint32(8, tamanhoTotal, true);
  vista.setUint32(12, jsonBytes.length, true);
  vista.setUint32(16, 0x4e4f534a, true); // "JSON"
  bytes.set(jsonBytes, 20);
  return bytes;
}

describe('validarGlb', () => {
  it('aceita um GLB bem formado', () => {
    expect(() => validarGlb(glbValido())).not.toThrow();
  });

  it('recusa um arquivo curto demais para ter cabecalho', () => {
    expect(() => validarGlb(new Uint8Array(4))).toThrow(/curto demais/);
  });

  it('recusa quando a assinatura nao e "glTF"', () => {
    const bytes = glbValido();
    new DataView(bytes.buffer).setUint32(0, 0, true);
    expect(() => validarGlb(bytes)).toThrow(/assinatura/);
  });

  it('recusa quando o tamanho declarado nao bate com o arquivo', () => {
    const bytes = glbValido();
    new DataView(bytes.buffer).setUint32(8, bytes.length + 100, true);
    expect(() => validarGlb(bytes)).toThrow(/truncado/);
  });

  it('recusa quando o primeiro bloco nao e JSON', () => {
    const bytes = glbValido();
    new DataView(bytes.buffer).setUint32(16, 0, true);
    expect(() => validarGlb(bytes)).toThrow(/deveria ser o JSON/);
  });

  it('recusa quando o bloco JSON nao tem o campo "asset"', () => {
    expect(() => validarGlb(glbValido({ meshes: [] }))).toThrow(/campo "asset"/);
  });

  it('recusa quando o bloco JSON nao e JSON valido', () => {
    const bytes = glbValido();
    // Estraga o conteudo do chunk JSON sem mexer no cabeçalho.
    bytes.set(new TextEncoder().encode('{ nao'), 20);
    expect(() => validarGlb(bytes)).toThrow(/não é um JSON válido/);
  });
});
