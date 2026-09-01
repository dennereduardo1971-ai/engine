import { describe, expect, it } from 'vitest';
import { type Instrucao, type Script } from '../src/arvore.ts';
import { imprimir } from '../src/imprimir.ts';
import { ler } from '../src/ler.ts';

/**
 * A promessa da secao 7 do plano, cobrada como teste:
 *
 *   "Você clica em ver como código, edita uma linha, volta para blocos,
 *    e o bloco mudou. Nada se perde no caminho."
 *
 * "Nada se perde" e uma afirmacao verificavel, e sao estes os dois testes que
 * a verificam: a arvore sobrevive a virar texto e voltar, e o texto sobrevive
 * a virar arvore e voltar.
 */

function idaEVolta(script: Script): Script {
  const codigo = imprimir(script);
  const leitura = ler(codigo, script.nome);
  if (!leitura.ok) {
    throw new Error(`não consegui reler o que escrevi: ${leitura.erro.mensagem}\n${codigo}`);
  }
  return leitura.script;
}

function script(...corpo: Instrucao[]): Script {
  return { nome: 'Teste', corpo };
}

describe('a árvore sobrevive a virar código e voltar', () => {
  const casos: [string, Script][] = [
    ['script vazio', script()],
    [
      'o exemplo do plano',
      script({
        tipo: 'quando',
        evento: 'Toque',
        parametro: 'jogador',
        corpo: [
          { tipo: 'fazer', chamada: { tipo: 'chamada', nome: 'tocarSom', argumentos: [{ tipo: 'texto', valor: 'mola.ogg' }] } },
          {
            tipo: 'fazer',
            chamada: {
              tipo: 'chamada',
              nome: 'empurrar',
              argumentos: [
                { tipo: 'nome', nome: 'jogador' },
                { tipo: 'nome', nome: 'CIMA' },
                { tipo: 'numero', valor: 20 },
              ],
            },
          },
        ],
      }),
    ],
    [
      'contas com precedência',
      script({
        tipo: 'criar',
        nome: 'total',
        valor: {
          tipo: 'operacao',
          operador: '*',
          esquerda: {
            tipo: 'operacao',
            operador: '+',
            esquerda: { tipo: 'numero', valor: 1 },
            direita: { tipo: 'numero', valor: 2 },
          },
          direita: { tipo: 'numero', valor: 3 },
        },
      }),
    ],
    [
      'subtração à direita, que parênteses seguram',
      script({
        tipo: 'criar',
        nome: 'x',
        valor: {
          tipo: 'operacao',
          operador: '-',
          esquerda: { tipo: 'numero', valor: 10 },
          direita: {
            tipo: 'operacao',
            operador: '-',
            esquerda: { tipo: 'numero', valor: 4 },
            direita: { tipo: 'numero', valor: 1 },
          },
        },
      }),
    ],
    [
      'se com senão, aninhado',
      script({
        tipo: 'se',
        condicao: {
          tipo: 'operacao',
          operador: '&&',
          esquerda: { tipo: 'chamada', nome: 'aneis', argumentos: [] },
          direita: {
            tipo: 'operacao',
            operador: '>',
            esquerda: { tipo: 'chamada', nome: 'tempo', argumentos: [] },
            direita: { tipo: 'numero', valor: 10 },
          },
        },
        entao: [{ tipo: 'fazer', chamada: { tipo: 'chamada', nome: 'terminarFase', argumentos: [] } }],
        senao: [
          {
            tipo: 'se',
            condicao: { tipo: 'booleano', valor: false },
            entao: [{ tipo: 'fazer', chamada: { tipo: 'chamada', nome: 'esconder', argumentos: [] } }],
            senao: [],
          },
        ],
      }),
    ],
    [
      'enquanto, com guardar dentro',
      script(
        { tipo: 'criar', nome: 'i', valor: { tipo: 'numero', valor: 0 } },
        {
          tipo: 'enquanto',
          condicao: {
            tipo: 'operacao',
            operador: '<',
            esquerda: { tipo: 'nome', nome: 'i' },
            direita: { tipo: 'numero', valor: 3 },
          },
          corpo: [
            { tipo: 'fazer', chamada: { tipo: 'chamada', nome: 'darAneis', argumentos: [{ tipo: 'numero', valor: 1 }] } },
            {
              tipo: 'guardar',
              nome: 'i',
              valor: {
                tipo: 'operacao',
                operador: '+',
                esquerda: { tipo: 'nome', nome: 'i' },
                direita: { tipo: 'numero', valor: 1 },
              },
            },
          ],
        },
      ),
    ],
    [
      'opostos e negativos',
      script({
        tipo: 'criar',
        nome: 'v',
        valor: {
          tipo: 'oposto',
          operador: '!',
          valor: {
            tipo: 'operacao',
            operador: '<',
            esquerda: { tipo: 'oposto', operador: '-', valor: { tipo: 'numero', valor: 3 } },
            direita: { tipo: 'numero', valor: 0 },
          },
        },
      }),
    ],
    [
      'texto com aspas e quebra de linha',
      script({
        tipo: 'fazer',
        chamada: {
          tipo: 'chamada',
          nome: 'dizer',
          argumentos: [{ tipo: 'texto', valor: 'ele disse "oi"\ne foi embora' }],
        },
      }),
    ],
    [
      'notas não se perdem',
      script(
        { tipo: 'nota', texto: 'esta parte é do Téo' },
        { tipo: 'fazer', chamada: { tipo: 'chamada', nome: 'mostrar', argumentos: [] } },
      ),
    ],
    [
      'evento sem parâmetro',
      script({
        tipo: 'quando',
        evento: 'AoComecar',
        parametro: null,
        corpo: [{ tipo: 'fazer', chamada: { tipo: 'chamada', nome: 'dizer', argumentos: [{ tipo: 'texto', valor: 'vai!' }] } }],
      }),
    ],
  ];

  for (const [nome, arvore] of casos) {
    it(nome, () => {
      expect(idaEVolta(arvore)).toEqual(arvore);
    });
  }

  it('e sobrevive a dar duas voltas', () => {
    for (const [, arvore] of casos) {
      expect(idaEVolta(idaEVolta(arvore))).toEqual(arvore);
    }
  });
});

describe('o código sobrevive a virar árvore e voltar', () => {
  const codigos = [
    `on(Toque, (jogador) => {\n  tocarSom("mola.ogg");\n  empurrar(jogador, CIMA, 20);\n});\n`,
    `let vidas = 3;\nvidas = vidas - 1;\n`,
    `if (aneis() >= 10) {\n  terminarFase();\n} else {\n  dizer("faltam anéis");\n}\n`,
    `// um recado\nmostrar();\n`,
    `while (meuY() < 10) {\n  mover(0, 1, 0);\n}\n`,
    `let x = (1 + 2) * 3 - -4;\n`,
  ];

  for (const codigo of codigos) {
    it(codigo.split('\n')[0].slice(0, 42), () => {
      const leitura = ler(codigo);
      expect(leitura.ok).toBe(true);
      if (!leitura.ok) return;
      expect(imprimir(leitura.script)).toBe(codigo);
    });
  }
});
