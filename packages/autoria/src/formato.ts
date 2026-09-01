import { imprimir, ler } from '@faisca/blocos';
import {
  FORMAT_VERSION,
  identityTransform,
  type SceneData,
  type SceneNode,
} from './documento.ts';

/**
 * O formato `.cena` — a fase gravada como texto que uma pessoa consegue ler.
 *
 * A secao 5 do plano e explicita: tudo em texto, e um `git diff` tem que
 * mostrar "mudou a velocidade do inimigo de 3 para 5", e nao um blob binario.
 * Por isso cada no ocupa exatamente uma linha: mover uma peca muda uma linha
 * do arquivo, e nao o arquivo inteiro.
 *
 * O que sai daqui e JSON valido com comentarios — ou seja, um subconjunto de
 * JSON5. O leitor e tolerante de proposito: aceita comentarios de `//` e de
 * `/* *\/`, e virgula sobrando no fim de uma lista, porque quem editar o
 * arquivo na mao vai deixar as duas coisas. Chave sem aspas e aspas simples,
 * o resto do JSON5, ficam para quando o editor de texto do plano existir.
 *
 * As chaves do arquivo estao em portugues: o arquivo e a interface de quem le
 * o diff, e a secao 6 manda a interface falar portugues.
 */

const CABECALHO = [
  '// Faísca — cena.',
  '// Texto legível de propósito: um "git diff" mostra o que mudou na fase.',
  '// Cada linha de "nos" é uma peça colocada. Pode editar na mão e comentar.',
].join('\n');

/** Escreve o documento no formato `.cena`. */
export function writeScene(data: SceneData): string {
  const linhas = data.nodes.map((node) => `    ${writeNode(node)}`);
  return [
    CABECALHO,
    '{',
    `  "faisca": ${JSON.stringify(data.format || FORMAT_VERSION)},`,
    `  "cena": ${JSON.stringify(data.name)},`,
    '  "nos": [',
    linhas.join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

function writeNode(node: SceneNode): string {
  const partes = [
    `"id": ${JSON.stringify(node.id)}`,
    `"nome": ${JSON.stringify(node.name)}`,
    `"peca": ${JSON.stringify(node.piece)}`,
  ];
  if (node.parent !== null) partes.push(`"pai": ${JSON.stringify(node.parent)}`);

  const t = node.transform;
  partes.push(`"pos": [${num(t.x)}, ${num(t.y)}, ${num(t.z)}]`);
  // O que esta no valor de fabrica nao vai para o arquivo: linha curta, diff
  // curto, e o arquivo mostra so o que a pessoa realmente mexeu.
  if (t.yaw !== 0) partes.push(`"giro": ${num(t.yaw)}`);
  if (t.sx !== 1 || t.sy !== 1 || t.sz !== 1) {
    partes.push(`"escala": [${num(t.sx)}, ${num(t.sy)}, ${num(t.sz)}]`);
  }
  if (node.color !== null) partes.push(`"cor": "${hex(node.color)}"`);
  if (!node.visible) partes.push('"oculto": true');

  const componentes = Object.entries(node.fields).filter(
    ([, values]) => Object.keys(values).length > 0,
  );
  if (node.script && node.script.corpo.length > 0) {
    // O script vai para o arquivo como *codigo*, e nao como a arvore em JSON.
    // As duas formas guardam a mesma coisa — a ida e volta e sem perda —, mas
    // so uma delas faz o `git diff` dizer "mudou a força da mola de 20 para
    // 30" em vez de despejar trinta linhas de objeto aninhado.
    partes.push(`"script": ${JSON.stringify(imprimir(node.script))}`);
  }

  if (componentes.length > 0) {
    const corpo = componentes
      .map(([componente, values]) => {
        const campos = Object.entries(values)
          .map(([campo, valor]) => `${JSON.stringify(campo)}: ${num(valor)}`)
          .join(', ');
        return `${JSON.stringify(componente)}: { ${campos} }`;
      })
      .join(', ');
    partes.push(`"campos": { ${corpo} }`);
  }

  return `{ ${partes.join(', ')} }`;
}

/**
 * Le um `.cena`. Erra em portugues e dizendo o que fazer — a secao 7 do plano
 * cobra isso do editor inteiro, e vale tambem para o arquivo.
 */
export function readScene(text: string): SceneData {
  let bruto: unknown;
  try {
    bruto = JSON.parse(limpar(text));
  } catch (erro) {
    throw new Error(
      `Faísca: não consegui ler esta cena. O arquivo parece estar quebrado — ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }
  if (!bruto || typeof bruto !== 'object') {
    throw new Error('Faísca: esta cena está vazia ou não é um arquivo de cena.');
  }

  const dados = bruto as Record<string, unknown>;
  const nos = dados.nos;
  if (!Array.isArray(nos)) {
    throw new Error('Faísca: esta cena não tem a lista "nos". Não parece um arquivo de cena.');
  }

  return {
    format: typeof dados.faisca === 'string' ? dados.faisca : FORMAT_VERSION,
    name: typeof dados.cena === 'string' ? dados.cena : 'Fase',
    nodes: nos.map((no, indice) => readNode(no, indice)),
  };
}

function readNode(bruto: unknown, indice: number): SceneNode {
  if (!bruto || typeof bruto !== 'object') {
    throw new Error(`Faísca: a peça número ${indice + 1} da cena não pôde ser lida.`);
  }
  const no = bruto as Record<string, unknown>;
  const peca = typeof no.peca === 'string' ? no.peca : '';
  if (!peca) {
    throw new Error(`Faísca: a peça número ${indice + 1} da cena não diz qual peça ela é.`);
  }

  const pos = trio(no.pos, [0, 0, 0]);
  const escala = trio(no.escala, [1, 1, 1]);
  const transform = {
    ...identityTransform(),
    x: pos[0],
    y: pos[1],
    z: pos[2],
    yaw: typeof no.giro === 'number' ? no.giro : 0,
    sx: escala[0],
    sy: escala[1],
    sz: escala[2],
  };

  // Peca sem script nao ganha a chave: o no que sai do arquivo fica igual ao
  // no que entrou, e a ida e volta continua comparavel campo a campo.
  const script = readScript(no.script);

  return {
    ...(script ? { script } : {}),
    id: typeof no.id === 'string' ? no.id : `n${indice + 1}`,
    name: typeof no.nome === 'string' ? no.nome : peca,
    piece: peca,
    parent: typeof no.pai === 'string' ? no.pai : null,
    transform,
    fields: readFields(no.campos),
    color: readColor(no.cor),
    visible: no.oculto !== true,
  };
}

/**
 * Le o script de volta.
 *
 * Um script que nao le vira `null`, e nao uma explosao: um arquivo estragado
 * pode custar o script daquela peca, mas nao pode custar a fase inteira.
 */
function readScript(bruto: unknown): SceneNode['script'] {
  if (typeof bruto !== 'string' || bruto.trim() === '') return null;
  const leitura = ler(bruto);
  return leitura.ok ? leitura.script : null;
}

function readFields(bruto: unknown): Record<string, Record<string, number>> {
  const saida: Record<string, Record<string, number>> = {};
  if (!bruto || typeof bruto !== 'object') return saida;
  for (const [componente, valores] of Object.entries(bruto as Record<string, unknown>)) {
    if (!valores || typeof valores !== 'object') continue;
    const bag: Record<string, number> = {};
    for (const [campo, valor] of Object.entries(valores as Record<string, unknown>)) {
      if (typeof valor === 'number' && Number.isFinite(valor)) bag[campo] = valor;
    }
    saida[componente] = bag;
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

function trio(bruto: unknown, padrao: [number, number, number]): [number, number, number] {
  if (!Array.isArray(bruto)) return padrao;
  return [
    typeof bruto[0] === 'number' ? bruto[0] : padrao[0],
    typeof bruto[1] === 'number' ? bruto[1] : padrao[1],
    typeof bruto[2] === 'number' ? bruto[2] : padrao[2],
  ];
}

/**
 * Tira comentarios e virgula sobrando, sem estragar o que estiver dentro de
 * uma string — um nome de fase como "Fase // final" tem que sobreviver.
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

  // Virgula antes de fechar lista ou objeto: JSON recusa, gente escreve.
  return saida.replace(/,(\s*[}\]])/g, '$1');
}

/** Numero curto: 0,1 + 0,2 nao vira 0.30000000000000004 dentro do arquivo. */
function num(value: number): string {
  const arredondado = Math.round(value * 10_000) / 10_000;
  return Object.is(arredondado, -0) ? '0' : String(arredondado);
}

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
