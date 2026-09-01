import { describe, expect, it } from 'vitest';
import {
  cabeEmRegras,
  imprimir,
  ler,
  moverAcao,
  porAcao,
  porRegra,
  regrasDe,
  scriptDeRegras,
  tirar,
  trocarEvento,
  trocarValor,
  type Script,
} from '../src/index.ts';

/**
 * As regras sao a terceira visao da mesma arvore (secao 7 do plano).
 *
 * O que estes testes cobram e exatamente isso: que a visao **le** a arvore em
 * vez de guardar uma copia dela, e que o que ela nao sabe desenhar continua
 * intacto depois de qualquer edicao feita por ela. Uma visao que perde o que
 * nao entende seria um segundo formato disfarcado.
 */
function arvore(codigo: string): Script {
  const leitura = ler(codigo, 'Peça');
  if (!leitura.ok) throw new Error(`não li: ${leitura.erro.mensagem}`);
  return leitura.script;
}

const PORTA = `on(AoEncostar, (jogador) => {
  abrir("Porta");
  tocarSom("porta");
});
`;

describe('ler a arvore como regras', () => {
  it('um "quando" com acoes simples vira uma regra', () => {
    const vista = regrasDe(arvore(PORTA));
    expect(vista.regras).toHaveLength(1);
    expect(vista.escondidas).toBe(0);

    const [regra] = vista.regras;
    expect(regra.evento).toBe('AoEncostar');
    expect(regra.escondidas).toBe(0);
    expect(regra.acoes.map((acao) => acao.bloco)).toEqual(['abrir', 'tocarSom']);
    expect(regra.acoes[0].argumentos).toEqual(['Porta']);
  });

  it('o caminho de cada acao aponta para o no dela na arvore', () => {
    const vista = regrasDe(arvore(PORTA));
    expect(vista.regras[0].caminho).toEqual([0]);
    expect(vista.regras[0].acoes[0].caminho).toEqual([0, 0]);
    expect(vista.regras[0].acoes[1].caminho).toEqual([0, 1]);
  });

  it('duas regras na mesma peca sao duas regras', () => {
    const vista = regrasDe(
      arvore('on(AoEncostar, (jogador) => {\n  abrir("Porta");\n});\non(AoSair, (jogador) => {\n  fechar("Porta");\n});\n'),
    );
    expect(vista.regras.map((regra) => regra.evento)).toEqual(['AoEncostar', 'AoSair']);
  });

  it('conta o que nao sabe desenhar, em vez de esconder calado', () => {
    const vista = regrasDe(
      arvore(
        'let vidas = 3;\n' +
          'on(ACadaQuadro, () => {\n' +
          '  if (vidas > 0) {\n' +
          '    girar(2);\n' +
          '  }\n' +
          '});\n',
      ),
    );
    // O "let" solto fica de fora, e o "if" dentro da regra tambem.
    expect(vista.escondidas).toBe(1);
    expect(vista.regras[0].escondidas).toBe(1);
    expect(vista.regras[0].acoes).toHaveLength(0);
  });

  it('acao com conta dentro nao cabe na tela de regras', () => {
    const vista = regrasDe(arvore('on(ACadaQuadro, () => {\n  irPara(meuX(), 3, 0);\n});\n'));
    expect(vista.regras[0].acoes).toHaveLength(0);
    expect(vista.regras[0].escondidas).toBe(1);
    expect(cabeEmRegras(arvore('on(ACadaQuadro, () => {\n  irPara(meuX(), 3, 0);\n});\n'))).toBe(
      false,
    );
  });

  it('um script so de regras cabe inteiro', () => {
    expect(cabeEmRegras(arvore(PORTA))).toBe(true);
  });
});

describe('ida e volta', () => {
  it('ler como regras e escrever de volta da a mesma arvore', () => {
    const original = arvore(PORTA);
    const vista = regrasDe(original);
    const devolta = scriptDeRegras(vista.regras, original.nome);
    expect(devolta).toEqual(original);
  });

  it('a arvore escrita pelas regras imprime como o codigo original', () => {
    const original = arvore(PORTA);
    const devolta = scriptDeRegras(regrasDe(original).regras, original.nome);
    expect(imprimir(devolta)).toBe(PORTA);
  });

  it('numero, texto e sim/nao sobrevivem a volta', () => {
    const codigo =
      'on(AoComecar, () => {\n  darAneis(5);\n  dizer("oi");\n  girar(-45);\n});\n';
    const original = arvore(codigo);
    expect(imprimir(scriptDeRegras(regrasDe(original).regras, original.nome))).toBe(codigo);
  });

  /**
   * O menos na frente de um numero e, na arvore, um "oposto" aplicado a um
   * numero — e nao um numero negativo. A visao de regras le os dois como o
   * mesmo valor, e escreve sempre a forma curta; o texto impresso e igual, que
   * e o que importa para o arquivo e para o `git diff`.
   */
  it('numero negativo cabe na regra, venha ele de que forma vier', () => {
    const vista = regrasDe(arvore('on(AoComecar, () => {\n  girar(-45);\n});\n'));
    expect(vista.regras[0].acoes[0].argumentos).toEqual([-45]);
    expect(vista.regras[0].escondidas).toBe(0);
  });
});

describe('editar pelas regras', () => {
  it('por uma regra nova poe um "quando" vazio com o parametro do evento', () => {
    const script = porRegra({ nome: 'Peça', corpo: [] }, 'AoEncostar');
    expect(script.corpo).toHaveLength(1);
    expect(imprimir(script)).toBe('on(AoEncostar, (jogador) => {\n});\n');
  });

  it('por uma acao usa os valores de fabrica do bloco', () => {
    let script = porRegra({ nome: 'Peça', corpo: [] }, 'AoComecar');
    script = porAcao(script, [0], 'tocarSom');
    expect(regrasDe(script).regras[0].acoes[0].argumentos).toEqual(['porta']);
  });

  it('trocar um valor troca so aquele buraco', () => {
    let script = arvore(PORTA);
    script = trocarValor(script, [0, 0], 0, 'Portão');
    const vista = regrasDe(script);
    expect(vista.regras[0].acoes[0].argumentos).toEqual(['Portão']);
    expect(vista.regras[0].acoes[1].argumentos).toEqual(['porta']);
  });

  it('mover uma acao troca a ordem, e nao o conteudo', () => {
    const script = moverAcao(arvore(PORTA), [0, 1], -1);
    expect(regrasDe(script).regras[0].acoes.map((a) => a.bloco)).toEqual(['tocarSom', 'abrir']);
  });

  it('mover para fora da lista nao faz nada', () => {
    const script = moverAcao(arvore(PORTA), [0, 0], -1);
    expect(regrasDe(script).regras[0].acoes.map((a) => a.bloco)).toEqual(['abrir', 'tocarSom']);
  });

  it('trocar o evento mantem as acoes que ja estavam dentro', () => {
    const script = trocarEvento(arvore(PORTA), [0], 'AoSair');
    const [regra] = regrasDe(script).regras;
    expect(regra.evento).toBe('AoSair');
    expect(regra.acoes).toHaveLength(2);
  });

  it('tirar apaga so o que foi apontado', () => {
    const script = tirar(arvore(PORTA), [0, 0]);
    expect(regrasDe(script).regras[0].acoes.map((a) => a.bloco)).toEqual(['tocarSom']);
  });

  /**
   * O teste que justifica o desenho inteiro: a tela de regras mexe *na
   * arvore*, e nao numa copia simplificada dela. Se ela reescrevesse o script
   * a partir do que consegue mostrar, o `if` daqui sumiria — e quem montou a
   * regra nunca saberia o que aconteceu com o resto do que a peca fazia.
   */
  it('editar pelas regras nao apaga o que as regras nao mostram', () => {
    const codigo =
      'let voltas = 0;\n' +
      'on(AoEncostar, (jogador) => {\n' +
      '  abrir("Porta");\n' +
      '  if (voltas > 2) {\n' +
      '    dizer("de novo?");\n' +
      '  }\n' +
      '});\n';
    // O caminho vem da propria vista: a regra e o segundo no do script, e nao
    // o primeiro, porque o "let" solto ocupa o primeiro lugar.
    const original = arvore(codigo);
    const acao = regrasDe(original).regras[0].acoes[0];
    expect(acao.caminho).toEqual([1, 0]);
    const script = trocarValor(original, acao.caminho, 0, 'Portão');
    const texto = imprimir(script);
    expect(texto).toContain('let voltas = 0;');
    expect(texto).toContain('if (voltas > 2)');
    expect(texto).toContain('abrir("Portão")');
  });

  it('nenhuma edicao mexe no script que recebeu', () => {
    const original = arvore(PORTA);
    const antes = imprimir(original);
    trocarValor(original, [0, 0], 0, 'Outra');
    tirar(original, [0, 0]);
    porAcao(original, [0], 'esconder');
    expect(imprimir(original)).toBe(antes);
  });
});
