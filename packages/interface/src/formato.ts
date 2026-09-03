import { elementoOuPlaceholder } from './elementos.ts';
import { FORMAT_VERSION, type Ancora, type UiData, type UiNode } from './documento.ts';

/**
 * O formato `.ui` — uma tela (HUD, menu) gravada como texto que uma pessoa
 * consegue ler.
 *
 * Mesma receita de `@faisca/autoria/formato.ts` para o `.cena`: um no por
 * linha, so o que foi editado sai dos valores de fabrica (aqui, do
 * `Elemento` do catalogo), e o leitor aceita comentario e virgula sobrando
 * porque quem editar o arquivo na mao vai deixar as duas coisas.
 *
 * As chaves do arquivo estao em portugues, como o `.cena`.
 */

const CABECALHO = [
  '// Faísca — tela de interface.',
  '// Texto legível de propósito: um "git diff" mostra o que mudou no menu.',
  '// Cada linha de "nos" é um elemento colocado. Pode editar na mão e comentar.',
].join('\n');

/** Escreve o documento no formato `.ui`. */
export function writeInterface(data: UiData): string {
  const linhas = data.nodes.map((node) => `    ${writeNode(node)}`);
  return [
    CABECALHO,
    '{',
    `  "faisca": ${JSON.stringify(data.format || FORMAT_VERSION)},`,
    `  "tela": ${JSON.stringify(data.name)},`,
    '  "nos": [',
    linhas.join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

function writeNode(node: UiNode): string {
  const elemento = elementoOuPlaceholder(node.elemento);
  const partes = [
    `"id": ${JSON.stringify(node.id)}`,
    `"nome": ${JSON.stringify(node.name)}`,
    `"elemento": ${JSON.stringify(node.elemento)}`,
  ];
  if (node.parent !== null) partes.push(`"pai": ${JSON.stringify(node.parent)}`);

  // "topo-esquerda" e a ancora de fabrica: uma tela toda ancorada la nao
  // precisa dizer isso em cada linha.
  if (node.ancora !== 'topo-esquerda') partes.push(`"ancora": ${JSON.stringify(node.ancora)}`);
  if (node.offsetX !== 0 || node.offsetY !== 0) {
    partes.push(`"pos": [${num(node.offsetX)}, ${num(node.offsetY)}]`);
  }
  if (node.largura !== null || node.altura !== null) {
    partes.push(`"tamanho": [${sizeNum(node.largura)}, ${sizeNum(node.altura)}]`);
  }
  if (node.texto !== null) partes.push(`"texto": ${JSON.stringify(node.texto)}`);
  if (node.cor !== null) partes.push(`"cor": "${hex(node.cor)}"`);
  if (!node.visible) partes.push('"oculto": true');

  const campos = Object.entries(node.fields).filter(
    ([campo, valor]) => elemento.fields[campo] !== valor,
  );
  if (campos.length > 0) {
    const corpo = campos.map(([campo, valor]) => `${JSON.stringify(campo)}: ${num(valor)}`).join(', ');
    partes.push(`"campos": { ${corpo} }`);
  }

  return `{ ${partes.join(', ')} }`;
}

/**
 * Le um `.ui`. Erra em portugues e dizendo o que fazer — a secao 7 do plano
 * cobra isso do editor inteiro, e vale tambem para o arquivo.
 */
export function readInterface(text: string): UiData {
  let bruto: unknown;
  try {
    bruto = JSON.parse(limpar(text));
  } catch (erro) {
    throw new Error(
      `Faísca: não consegui ler esta tela. O arquivo parece estar quebrado — ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }
  if (!bruto || typeof bruto !== 'object') {
    throw new Error('Faísca: esta tela está vazia ou não é um arquivo de interface.');
  }

  const dados = bruto as Record<string, unknown>;
  const nos = dados.nos;
  if (!Array.isArray(nos)) {
    throw new Error('Faísca: esta tela não tem a lista "nos". Não parece um arquivo de interface.');
  }

  return {
    format: typeof dados.faisca === 'string' ? dados.faisca : FORMAT_VERSION,
    name: typeof dados.tela === 'string' ? dados.tela : 'Tela 1',
    nodes: nos.map((no, indice) => readNode(no, indice)),
  };
}

const ANCORAS: readonly Ancora[] = [
  'topo-esquerda',
  'topo',
  'topo-direita',
  'esquerda',
  'centro',
  'direita',
  'baixo-esquerda',
  'baixo',
  'baixo-direita',
];

function readNode(bruto: unknown, indice: number): UiNode {
  if (!bruto || typeof bruto !== 'object') {
    throw new Error(`Faísca: o elemento número ${indice + 1} da tela não pôde ser lido.`);
  }
  const no = bruto as Record<string, unknown>;
  const elemento = typeof no.elemento === 'string' ? no.elemento : '';
  if (!elemento) {
    throw new Error(`Faísca: o elemento número ${indice + 1} da tela não diz qual elemento é.`);
  }

  const pos = par(no.pos, [0, 0]);
  const tamanho = par(no.tamanho, null);
  const ancora = typeof no.ancora === 'string' && (ANCORAS as string[]).includes(no.ancora)
    ? (no.ancora as Ancora)
    : 'topo-esquerda';

  return {
    id: typeof no.id === 'string' ? no.id : `n${indice + 1}`,
    name: typeof no.nome === 'string' ? no.nome : elemento,
    elemento,
    parent: typeof no.pai === 'string' ? no.pai : null,
    ancora,
    offsetX: pos[0],
    offsetY: pos[1],
    largura: tamanho ? tamanho[0] : null,
    altura: tamanho ? tamanho[1] : null,
    texto: typeof no.texto === 'string' ? no.texto : null,
    cor: readColor(no.cor),
    fields: readFields(no.campos),
    visible: no.oculto !== true,
  };
}

function readFields(bruto: unknown): Record<string, number> {
  const saida: Record<string, number> = {};
  if (!bruto || typeof bruto !== 'object') return saida;
  for (const [campo, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof valor === 'number' && Number.isFinite(valor)) saida[campo] = valor;
  }
  return saida;
}

function readColor(bruto: unknown): number | null {
  if (typeof bruto === 'number' && Number.isFinite(bruto)) return bruto;
  if (typeof bruto !== 'string') return null;
  const limpo = bruto.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpo)) return null;
  return Number.parseInt(limpo, 16);
}

function par(bruto: unknown, padrao: [number, number]): [number, number];
function par(bruto: unknown, padrao: null): [number, number] | null;
function par(bruto: unknown, padrao: [number, number] | null): [number, number] | null {
  if (!Array.isArray(bruto) || bruto.length < 2) return padrao;
  const [a, b] = bruto;
  if (typeof a !== 'number' && a !== null) return padrao;
  if (typeof b !== 'number' && b !== null) return padrao;
  return [typeof a === 'number' ? a : 0, typeof b === 'number' ? b : 0];
}

/**
 * Tira comentarios e virgula sobrando, sem estragar o que estiver dentro de
 * uma string — um nome de tela como "Menu // final" tem que sobreviver.
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

/** Numero curto: 0,1 + 0,2 nao vira 0.30000000000000004 dentro do arquivo. */
function num(value: number): string {
  const arredondado = Math.round(value * 10_000) / 10_000;
  return Object.is(arredondado, -0) ? '0' : String(arredondado);
}

function sizeNum(value: number | null): string {
  return value === null ? 'null' : num(value);
}

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
