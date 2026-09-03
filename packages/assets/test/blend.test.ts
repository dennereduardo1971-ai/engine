import { describe, expect, it } from 'vitest';
import { validarBlend } from '../src/index.ts';

describe('validarBlend', () => {
  it('aceita um .blend sem compressao', () => {
    const bytes = new TextEncoder().encode('BLENDER-v300RENDh\x00');
    expect(() => validarBlend(bytes)).not.toThrow();
  });

  it('aceita um .blend comprimido (assinatura gzip)', () => {
    expect(() => validarBlend(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]))).not.toThrow();
  });

  it('recusa um arquivo sem nenhuma das duas assinaturas', () => {
    expect(() => validarBlend(new TextEncoder().encode('nao-e-um-blend'))).toThrow(
      /assinatura "BLENDER"/,
    );
  });
});
