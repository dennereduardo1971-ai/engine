import { describe, expect, it } from 'vitest';
import { tomWav } from '../src/audio.ts';

function texto(bytes: Uint8Array, offset: number, tamanho: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + tamanho));
}

describe('tomWav', () => {
  it('gera um cabecalho WAV valido', () => {
    const wav = tomWav(440, 0.1);
    expect(texto(wav, 0, 4)).toBe('RIFF');
    expect(texto(wav, 8, 4)).toBe('WAVE');
    expect(texto(wav, 12, 4)).toBe('fmt ');
    expect(texto(wav, 36, 4)).toBe('data');
  });

  it('o tamanho dos dados bate com a duracao pedida', () => {
    const sampleRate = 22050;
    const wav = tomWav(440, 0.5, sampleRate);
    const dv = new DataView(wav.buffer);
    const tamanhoDados = dv.getUint32(40, true);
    expect(tamanhoDados).toBe(Math.round(0.5 * sampleRate) * 2);
    expect(wav.length).toBe(44 + tamanhoDados);
  });

  it('nao estoura a amplitude de 16 bits', () => {
    const wav = tomWav(660, 0.05);
    const dv = new DataView(wav.buffer);
    for (let offset = 44; offset < wav.length; offset += 2) {
      const amostra = dv.getInt16(offset, true);
      expect(amostra).toBeGreaterThanOrEqual(-0x7fff);
      expect(amostra).toBeLessThanOrEqual(0x7fff);
    }
  });
});
