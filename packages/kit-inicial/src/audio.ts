/**
 * Um WAV de verdade: PCM 16 bits mono, sem compressao nenhuma — o formato
 * mais simples que existe, nao precisa de nada parecido com o truque do
 * PNG em `imagem.ts`. Gera um tom puro (seno), so para o kit inicial ter
 * um som e uma musica de espaco reservado antes da arte licenciada
 * (secao 11 do plano) chegar.
 */
export function tomWav(frequenciaHz: number, duracaoSegundos: number, sampleRate = 22050): Uint8Array {
  const numAmostras = Math.round(duracaoSegundos * sampleRate);
  const tamanhoDados = numAmostras * 2; // 16 bits = 2 bytes por amostra
  const buffer = new Uint8Array(44 + tamanhoDados);
  const dv = new DataView(buffer.buffer);

  escrever(buffer, 0, 'RIFF');
  dv.setUint32(4, 36 + tamanhoDados, true);
  escrever(buffer, 8, 'WAVE');
  escrever(buffer, 12, 'fmt ');
  dv.setUint32(16, 16, true); // tamanho do bloco fmt
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // 1 canal (mono)
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits por amostra
  escrever(buffer, 36, 'data');
  dv.setUint32(40, tamanhoDados, true);

  // Fade in/out curto para nao estalar no inicio/fim da amostra.
  const fade = Math.min(numAmostras, Math.round(sampleRate * 0.01));
  const amplitude = 0.3 * 0x7fff;
  for (let i = 0; i < numAmostras; i++) {
    const envelope = Math.min(i / Math.max(fade, 1), (numAmostras - i) / Math.max(fade, 1), 1);
    const valor = Math.round(Math.sin((2 * Math.PI * frequenciaHz * i) / sampleRate) * amplitude * envelope);
    dv.setInt16(44 + i * 2, valor, true);
  }

  return buffer;
}

function escrever(buffer: Uint8Array, offset: number, texto: string): void {
  for (let i = 0; i < texto.length; i++) buffer[offset + i] = texto.charCodeAt(i);
}
