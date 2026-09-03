import { FORMAT_VERSION, type ConversaData, type Opcao, type Passo } from './documento.ts';
import { CUTSCENE_VERSION, type Acao, type CutsceneData, type Marca } from './cutscene.ts';

/**
 * O formato `.dialogo` — a conversa gravada como texto que uma pessoa
 * consegue ler, e principalmente **escrever na mao**.
 *
 * Mesma receita do `.cena` e do `.ui`: um passo por linha, so o que foge do
 * padrao e escrito, e o leitor aceita comentario e virgula sobrando porque
 * quem editar o arquivo na mao vai deixar as duas coisas. Aqui isso pesa mais
 * que nos outros dois: texto de jogo e a parte que mais muda, e a que mais
 * gente que nao programa vai querer mexer direto.
 */

const CABECALHO = [
  '// Faísca — conversa.',
  '// Cada linha de "passos" é um balão de fala. Sem "opcoes", ela segue para "proxima".',
  '// Pode editar o texto na mão e comentar linhas.',
].join('\n');

export function writeDialogo(data: ConversaData): string {
  const linhas = data.passos.map((passo) => `    ${writePasso(passo)}`);
  return [
    CABECALHO,
    '{',
    `  "faisca": ${JSON.stringify(data.format || FORMAT_VERSION)},`,
    `  "conversa": ${JSON.stringify(data.name)},`,
    '  "passos": [',
    linhas.join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

function writePasso(passo: Passo): string {
  const partes = [`"id": ${JSON.stringify(passo.id)}`];
  if (passo.quem !== '') partes.push(`"quem": ${JSON.stringify(passo.quem)}`);
  partes.push(`"fala": ${JSON.stringify(passo.texto)}`);
  if (passo.proxima !== null) partes.push(`"proxima": ${JSON.stringify(passo.proxima)}`);
  if (passo.opcoes.length > 0) {
    const corpo = passo.opcoes.map((opcao) => writeOpcao(opcao)).join(', ');
    partes.push(`"opcoes": [${corpo}]`);
  }
  return `{ ${partes.join(', ')} }`;
}

function writeOpcao(opcao: Opcao): string {
  const destino = opcao.destino === null ? '' : `, "vai": ${JSON.stringify(opcao.destino)}`;
  return `{ "texto": ${JSON.stringify(opcao.texto)}${destino} }`;
}

/** Le um `.dialogo`. Erra em portugues e dizendo o que fazer. */
export function readDialogo(text: string): ConversaData {
  let bruto: unknown;
  try {
    bruto = JSON.parse(limpar(text));
  } catch (erro) {
    throw new Error(
      `Faísca: não consegui ler esta conversa. O arquivo parece estar quebrado — ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }
  if (!bruto || typeof bruto !== 'object') {
    throw new Error('Faísca: esta conversa está vazia ou não é um arquivo de diálogo.');
  }

  const dados = bruto as Record<string, unknown>;
  const passos = dados.passos;
  if (!Array.isArray(passos)) {
    throw new Error(
      'Faísca: esta conversa não tem a lista "passos". Não parece um arquivo de diálogo.',
    );
  }

  return {
    format: typeof dados.faisca === 'string' ? dados.faisca : FORMAT_VERSION,
    name: typeof dados.conversa === 'string' ? dados.conversa : 'Conversa 1',
    passos: passos.map((passo, indice) => readPasso(passo, indice)),
  };
}

function readPasso(bruto: unknown, indice: number): Passo {
  if (!bruto || typeof bruto !== 'object') {
    throw new Error(`Faísca: a fala número ${indice + 1} da conversa não pôde ser lida.`);
  }
  const passo = bruto as Record<string, unknown>;
  const texto = typeof passo.fala === 'string' ? passo.fala : null;
  if (texto === null) {
    throw new Error(`Faísca: a fala número ${indice + 1} da conversa não tem o texto ("fala").`);
  }
  return {
    id: typeof passo.id === 'string' && passo.id !== '' ? passo.id : `p${indice + 1}`,
    quem: typeof passo.quem === 'string' ? passo.quem : '',
    texto,
    opcoes: readOpcoes(passo.opcoes),
    proxima: typeof passo.proxima === 'string' ? passo.proxima : null,
  };
}

function readOpcoes(bruto: unknown): Opcao[] {
  if (!Array.isArray(bruto)) return [];
  const saida: Opcao[] = [];
  for (const item of bruto) {
    // Uma opcao pode ser so o texto: `"opcoes": ["Sim", "Não"]` encerra a
    // conversa nas duas, e e o jeito mais curto de escrever na mao.
    if (typeof item === 'string') {
      saida.push({ texto: item, destino: null });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const opcao = item as Record<string, unknown>;
    if (typeof opcao.texto !== 'string') continue;
    saida.push({ texto: opcao.texto, destino: typeof opcao.vai === 'string' ? opcao.vai : null });
  }
  return saida;
}

/**
 * Tira comentarios e virgula sobrando, sem estragar o que estiver dentro de
 * uma string — uma fala como "vai // embora" tem que sobreviver.
 */
function limpar(text: string): string {
  let saida = '';
  let i = 0;
  let dentroDeString = false;

  while (i < text.length) {
    const c = text[i];

    if (dentroDeString) {
      saida += c;
      if (c === '\\') {
        saida += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') dentroDeString = false;
      i++;
      continue;
    }

    if (c === '"') {
      dentroDeString = true;
      saida += c;
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    saida += c;
    i++;
  }

  return saida.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * O formato `.cutscene` — a linha do tempo em texto.
 *
 * Uma marca por linha, na ordem do relogio: quem le o arquivo le a cena
 * acontecendo. Reaproveita o mesmo `limpar` do `.dialogo` — comentario e
 * virgula sobrando valem aqui tambem.
 */

const CABECALHO_CUTSCENE = [
  '// Faísca — cutscene.',
  '// Cada linha de "marcas" é uma ação: "em" é o segundo que ela começa, "dura" o tempo dela.',
].join('\n');

export function writeCutscene(data: CutsceneData): string {
  const linhas = data.marcas.map((marca) => `    ${writeMarca(marca)}`);
  return [
    CABECALHO_CUTSCENE,
    '{',
    `  "faisca": ${JSON.stringify(data.format || CUTSCENE_VERSION)},`,
    `  "cutscene": ${JSON.stringify(data.name)},`,
    '  "marcas": [',
    linhas.join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

function writeMarca(marca: Marca): string {
  const partes = [
    `"id": ${JSON.stringify(marca.id)}`,
    `"em": ${num(marca.em)}`,
  ];
  if (marca.duracao !== 0) partes.push(`"dura": ${num(marca.duracao)}`);
  partes.push(`"faz": ${JSON.stringify(marca.acao.kind)}`);

  const acao = marca.acao;
  switch (acao.kind) {
    case 'falar':
      if (acao.quem !== '') partes.push(`"quem": ${JSON.stringify(acao.quem)}`);
      partes.push(`"fala": ${JSON.stringify(acao.texto)}`);
      break;
    case 'camera':
      partes.push(`"alvo": ${JSON.stringify(acao.alvo)}`);
      break;
    case 'mover':
      partes.push(`"alvo": ${JSON.stringify(acao.alvo)}`);
      partes.push(`"para": [${acao.para.map((v) => num(v)).join(', ')}]`);
      break;
    case 'fazer':
      partes.push(`"evento": ${JSON.stringify(acao.evento)}`);
      break;
    case 'esperar':
      break;
  }
  return `{ ${partes.join(', ')} }`;
}

export function readCutscene(text: string): CutsceneData {
  let bruto: unknown;
  try {
    bruto = JSON.parse(limpar(text));
  } catch (erro) {
    throw new Error(
      `Faísca: não consegui ler esta cutscene. O arquivo parece estar quebrado — ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }
  if (!bruto || typeof bruto !== 'object') {
    throw new Error('Faísca: esta cutscene está vazia ou não é um arquivo de cena.');
  }

  const dados = bruto as Record<string, unknown>;
  const marcas = dados.marcas;
  if (!Array.isArray(marcas)) {
    throw new Error(
      'Faísca: esta cutscene não tem a lista "marcas". Não parece um arquivo de cutscene.',
    );
  }

  return {
    format: typeof dados.faisca === 'string' ? dados.faisca : CUTSCENE_VERSION,
    name: typeof dados.cutscene === 'string' ? dados.cutscene : 'Cutscene 1',
    marcas: marcas.map((marca, indice) => readMarca(marca, indice)),
  };
}

function readMarca(bruto: unknown, indice: number): Marca {
  if (!bruto || typeof bruto !== 'object') {
    throw new Error(`Faísca: a marca número ${indice + 1} da cutscene não pôde ser lida.`);
  }
  const marca = bruto as Record<string, unknown>;
  return {
    id: typeof marca.id === 'string' && marca.id !== '' ? marca.id : `m${indice + 1}`,
    em: numeroOu(marca.em, 0),
    duracao: Math.max(0, numeroOu(marca.dura, 0)),
    acao: readAcao(marca, indice),
  };
}

function readAcao(marca: Record<string, unknown>, indice: number): Acao {
  const faz = typeof marca.faz === 'string' ? marca.faz : 'esperar';
  const alvo = typeof marca.alvo === 'string' ? marca.alvo : '';
  switch (faz) {
    case 'falar':
      return {
        kind: 'falar',
        quem: typeof marca.quem === 'string' ? marca.quem : '',
        texto: typeof marca.fala === 'string' ? marca.fala : '',
      };
    case 'camera':
      return { kind: 'camera', alvo };
    case 'mover':
      return { kind: 'mover', alvo, para: trio(marca.para) };
    case 'fazer':
      return { kind: 'fazer', evento: typeof marca.evento === 'string' ? marca.evento : '' };
    case 'esperar':
      return { kind: 'esperar' };
    default:
      throw new Error(
        `Faísca: a marca número ${indice + 1} da cutscene pede "${faz}", que a Faísca não sabe fazer. Use falar, camera, mover, esperar ou fazer.`,
      );
  }
}

function trio(bruto: unknown): [number, number, number] {
  if (!Array.isArray(bruto)) return [0, 0, 0];
  return [numeroOu(bruto[0], 0), numeroOu(bruto[1], 0), numeroOu(bruto[2], 0)];
}

function numeroOu(bruto: unknown, padrao: number): number {
  return typeof bruto === 'number' && Number.isFinite(bruto) ? bruto : padrao;
}

/** Numero curto: 0,1 + 0,2 nao vira 0.30000000000000004 dentro do arquivo. */
function num(value: number): string {
  const arredondado = Math.round(value * 10_000) / 10_000;
  return Object.is(arredondado, -0) ? '0' : String(arredondado);
}
