import { describe, expect, it } from 'vitest';
import { validarAse } from '../src/index.ts';

/** Monta um cabecalho Aseprite minimo mas valido (128 bytes). */
function aseValido(): Uint8Array {
  const bytes = new Uint8Array(128);
  const vista = new DataView(bytes.buffer);
  vista.setUint32(0, bytes.length, true);
  vista.setUint16(4, 0xa5e0, true);
  return bytes;
}

describe('validarAse', () => {
  it('aceita um cabecalho Aseprite bem formado', () => {
    expect(() => validarAse(aseValido())).not.toThrow();
  });

  it('recusa um arquivo curto demais para ter cabecalho', () => {
    expect(() => validarAse(new Uint8Array(4))).toThrow(/curto demais/);
  });

  it('recusa quando a assinatura nao bate', () => {
    const bytes = aseValido();
    new DataView(bytes.buffer).setUint16(4, 0, true);
    expect(() => validarAse(bytes)).toThrow(/assinatura/);
  });

  it('recusa quando o tamanho declarado nao bate com o arquivo', () => {
    const bytes = aseValido();
    new DataView(bytes.buffer).setUint32(0, 999, true);
    expect(() => validarAse(bytes)).toThrow(/tamanho declarado/);
  });
});
