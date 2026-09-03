import { describe, expect, it } from 'vitest';
import { calcularAparencia, calcularPosicao, calcularPreenchimento } from '../src/renderizador.ts';
import { elementoOuPlaceholder, findElemento } from '../src/elementos.ts';
import { UiDocument, type AddOptions } from '../src/documento.ts';

/**
 * Só as funções puras: `UiRenderer` mexe em DOM de verdade, e o repositório
 * não tem jsdom/happy-dom instalado (nem `visualSyncSystem` nem `GameHud`
 * testam a parte que toca `document`) — mesmo corte de responsabilidade do
 * comentário no topo de `renderizador.ts`.
 */

function no({ elemento = 'botao', ...options }: AddOptions & { elemento?: string } = {}) {
  const documento = new UiDocument();
  const node = documento.add(elemento, options);
  return documento.get(node.id)!;
}

describe('calcularPosicao', () => {
  const botao = findElemento('botao')!;

  it('topo-esquerda: prende no topo e na esquerda', () => {
    const node = no({ ancora: 'topo-esquerda', offsetX: 10, offsetY: 20 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.top).toBe('20px');
    expect(estilo.left).toBe('10px');
    expect(estilo.bottom).toBeUndefined();
    expect(estilo.right).toBeUndefined();
    expect(estilo.transform).toBeUndefined();
  });

  it('topo: centraliza no eixo horizontal', () => {
    const node = no({ ancora: 'topo', offsetX: 0, offsetY: 5 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.top).toBe('5px');
    expect(estilo.left).toBe('calc(50% + 0px)');
    expect(estilo.transform).toBe('translateX(-50%)');
  });

  it('topo-direita: prende no topo e na direita', () => {
    const node = no({ ancora: 'topo-direita', offsetX: 8, offsetY: 4 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.top).toBe('4px');
    expect(estilo.right).toBe('8px');
  });

  it('esquerda: centraliza no eixo vertical', () => {
    const node = no({ ancora: 'esquerda', offsetX: 3, offsetY: 0 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.left).toBe('3px');
    expect(estilo.top).toBe('calc(50% + 0px)');
    expect(estilo.transform).toBe('translateY(-50%)');
  });

  it('centro: centraliza nos dois eixos', () => {
    const node = no({ ancora: 'centro', offsetX: 1, offsetY: 2 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.top).toBe('calc(50% + 2px)');
    expect(estilo.left).toBe('calc(50% + 1px)');
    expect(estilo.transform).toBe('translateY(-50%) translateX(-50%)');
  });

  it('direita: centraliza no eixo vertical, prende na direita', () => {
    const node = no({ ancora: 'direita', offsetX: 6, offsetY: 0 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.right).toBe('6px');
    expect(estilo.transform).toBe('translateY(-50%)');
  });

  it('baixo-esquerda: prende embaixo e na esquerda', () => {
    const node = no({ ancora: 'baixo-esquerda', offsetX: 2, offsetY: 3 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.bottom).toBe('3px');
    expect(estilo.left).toBe('2px');
  });

  it('baixo: prende embaixo, centraliza horizontal', () => {
    const node = no({ ancora: 'baixo', offsetX: 0, offsetY: 7 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.bottom).toBe('7px');
    expect(estilo.transform).toBe('translateX(-50%)');
  });

  it('baixo-direita: prende embaixo e na direita', () => {
    const node = no({ ancora: 'baixo-direita', offsetX: 9, offsetY: 1 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.bottom).toBe('1px');
    expect(estilo.right).toBe('9px');
  });

  it('usa largura/altura de fábrica do elemento quando o nó não define', () => {
    const node = no({ ancora: 'centro' });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.width).toBe(`${botao.largura}px`);
    expect(estilo.height).toBe(`${botao.altura}px`);
  });

  it('usa largura/altura do nó quando definidas', () => {
    const node = no({ ancora: 'centro', largura: 300, altura: 40 });
    const estilo = calcularPosicao(node, botao);
    expect(estilo.width).toBe('300px');
    expect(estilo.height).toBe('40px');
  });
});

describe('calcularAparencia', () => {
  it('texto: cor de fonte, fundo transparente', () => {
    const texto = findElemento('texto')!;
    const node = no({ elemento: 'texto', ancora: 'centro', cor: 0x112233 });
    const estilo = calcularAparencia(node, texto);
    expect(estilo.color).toBe('#112233');
    expect(estilo.background).toBe('transparent');
  });

  it('botao/painel/imagem: fundo colorido, texto branco', () => {
    const botao = findElemento('botao')!;
    const node = no({ elemento: 'botao', ancora: 'centro', cor: 0xabcdef });
    const estilo = calcularAparencia(node, botao);
    expect(estilo.background).toBe('#abcdef');
    expect(estilo.color).toBe('#fff');
  });

  it('barra: fundo claro fixo, sem cor de nó', () => {
    const barra = findElemento('barra')!;
    const node = no({ elemento: 'barra', ancora: 'centro', cor: 0xff0000 });
    const estilo = calcularAparencia(node, barra);
    expect(estilo.background).toBe('rgba(255,255,255,0.16)');
  });

  it('usa fields do nó quando definidos, senão os de fábrica do elemento', () => {
    const botao = findElemento('botao')!;
    const node = no({ elemento: 'botao', ancora: 'centro', fields: { fontSize: 30 } });
    const estilo = calcularAparencia(node, botao);
    expect(estilo.fontSize).toBe('30px');
    expect(estilo.borderRadius).toBe(`${botao.fields.raio}px`);
  });

  it('elemento desconhecido cai no placeholder (painel roxo)', () => {
    const elemento = elementoOuPlaceholder('nao-existe');
    const node = no({ elemento: 'nao-existe', ancora: 'centro' });
    const estilo = calcularAparencia(node, elemento);
    expect(estilo.background).toBe(`#${elemento.cor.toString(16).padStart(6, '0')}`);
  });
});

describe('calcularPreenchimento', () => {
  const barra = findElemento('barra')!;

  it('usa o valor de fábrica quando o nó não define', () => {
    const node = no({ elemento: 'barra', ancora: 'centro' });
    expect(calcularPreenchimento(node, barra)).toBe('100%');
  });

  it('usa o valor do campo do nó', () => {
    const node = no({ elemento: 'barra', ancora: 'centro', fields: { valor: 0.5 } });
    expect(calcularPreenchimento(node, barra)).toBe('50%');
  });

  it('satura em 0% e 100%', () => {
    const abaixo = no({ elemento: 'barra', ancora: 'centro', fields: { valor: -1 } });
    const acima = no({ elemento: 'barra', ancora: 'centro', fields: { valor: 5 } });
    expect(calcularPreenchimento(abaixo, barra)).toBe('0%');
    expect(calcularPreenchimento(acima, barra)).toBe('100%');
  });
});
