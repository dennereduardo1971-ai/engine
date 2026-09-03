/**
 * Um PNG de verdade, feito na mao.
 *
 * O kit inicial (secao 11 do plano) ainda nao tem arte licenciada — isso e
 * trabalho de arte, nao de codigo. O que da pra fazer agora e um
 * placeholder que passa pelo importador de verdade: um quadrado solido de
 * uma cor, no formato PNG real (assinatura, IHDR, IDAT, IEND), sem
 * depender de nenhuma biblioteca de imagem nem de `node:zlib` — o pacote
 * roda no navegador (editor) e no Node (teste) do mesmo jeito.
 *
 * O truque que evita escrever um compressor DEFLATE inteiro: o formato
 * zlib aceita um bloco "stored" (sem compressao nenhuma), que e so um
 * cabecalho de 5 bytes na frente dos dados crus. E permitido pela spec,
 * so nao e o menor arquivo possivel — o que aqui nao importa, sao 16x16
 * pixels.
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let n = 0; n < bytes.length; n++) {
    let c = (crc ^ bytes[n]) & 0xff;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function concat(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((soma, parte) => soma + parte.length, 0);
  const saida = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    saida.set(parte, offset);
    offset += parte.length;
  }
  return saida;
}

function u32be(valor: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, valor, false);
  return bytes;
}

/** DEFLATE em blocos "stored" — dados crus, sem nenhuma compressao. */
function deflateSemCompressao(dados: Uint8Array): Uint8Array {
  const MAX_BLOCO = 65535;
  const blocos: Uint8Array[] = [];
  let offset = 0;
  do {
    const tamanho = Math.min(MAX_BLOCO, dados.length - offset);
    const ultimo = offset + tamanho >= dados.length;
    const nlen = ~tamanho & 0xffff;
    const cabecalho = new Uint8Array([
      ultimo ? 1 : 0,
      tamanho & 0xff,
      (tamanho >>> 8) & 0xff,
      nlen & 0xff,
      (nlen >>> 8) & 0xff,
    ]);
    blocos.push(cabecalho, dados.subarray(offset, offset + tamanho));
    offset += tamanho;
  } while (offset < dados.length);
  return concat(blocos);
}

/** zlib = cabecalho (2 bytes) + DEFLATE + Adler-32 dos dados originais. */
function zlibSemCompressao(dados: Uint8Array): Uint8Array {
  return concat([
    new Uint8Array([0x78, 0x01]),
    deflateSemCompressao(dados),
    u32be(adler32(dados)),
  ]);
}

function pngChunk(tipo: string, dados: Uint8Array): Uint8Array {
  const tipoEDados = concat([new TextEncoder().encode(tipo), dados]);
  return concat([u32be(dados.length), tipoEDados, u32be(crc32(tipoEDados))]);
}

/** RGBA, cada canal 0-255. */
export type Cor = readonly [r: number, g: number, b: number, a: number];

/** Um PNG RGBA de `tamanho` x `tamanho` pixels, todos da mesma cor solida. */
export function pngQuadradoSolido(cor: Cor, tamanho = 16): Uint8Array {
  const assinatura = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = new Uint8Array(13);
  const dvIhdr = new DataView(ihdr.buffer);
  dvIhdr.setUint32(0, tamanho, false);
  dvIhdr.setUint32(4, tamanho, false);
  ihdr[8] = 8; // profundidade de bits por canal
  ihdr[9] = 6; // tipo de cor: RGBA
  ihdr[10] = 0; // compressao (so existe deflate)
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // sem interlace

  const [r, g, b, a] = cor;
  const bytesPorLinha = 1 + tamanho * 4; // 1 byte de filtro + RGBA por pixel
  const raw = new Uint8Array(bytesPorLinha * tamanho);
  for (let y = 0; y < tamanho; y++) {
    const base = y * bytesPorLinha; // raw[base] fica 0: filtro "nenhum"
    for (let x = 0; x < tamanho; x++) {
      const p = base + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }

  return concat([
    assinatura,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibSemCompressao(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}
