import { describe, expect, it } from 'vitest';
import { readInterface, UiDocument, writeInterface } from '../src/index.ts';

/**
 * Mesma promessa do `.cena`: um `git diff` da tela mostra o que mudou no
 * menu. So vale se a ida e volta nao perder nada e um elemento ocupar uma
 * linha.
 */
describe('formato .ui', () => {
  it('vai e volta sem perder nada', () => {
    const doc = new UiDocument('Menu');
    doc.add('painel');
    const botao = doc.add('botao', {
      parent: doc.nodes[0].id,
      ancora: 'centro',
      offsetX: 10,
      offsetY: -5,
      texto: 'Jogar',
      cor: 0x123456,
    });
    doc.setFields(botao.id, { raio: 20 });

    const lido = readInterface(writeInterface(doc.toData()));
    expect(lido.name).toBe('Menu');
    expect(lido.nodes).toHaveLength(2);
    expect(lido.nodes).toEqual(doc.toData().nodes);
  });

  it('grava um elemento por linha', () => {
    const doc = new UiDocument('Menu');
    doc.add('texto');
    doc.add('texto');
    doc.add('botao');

    const linhas = writeInterface(doc.toData())
      .split('\n')
      .filter((linha) => linha.trim().startsWith('{ "id"'));
    expect(linhas).toHaveLength(3);
  });

  it('nao grava o que esta no valor de fabrica', () => {
    const doc = new UiDocument('Menu');
    doc.add('texto');
    const texto = writeInterface(doc.toData());

    expect(texto).not.toContain('"ancora"');
    expect(texto).not.toContain('"pos"');
    expect(texto).not.toContain('"tamanho"');
    expect(texto).not.toContain('"cor"');
    expect(texto).not.toContain('"campos"');
    expect(texto).not.toContain('"pai"');
  });

  it('so grava os campos que diferem do valor de fabrica do elemento', () => {
    const doc = new UiDocument('Menu');
    const botao = doc.add('botao');
    doc.setFields(botao.id, { fontSize: 20, raio: 30 });

    const texto = writeInterface(doc.toData());
    expect(texto).not.toContain('"fontSize"');
    expect(texto).toContain('"raio": 30');
  });

  it('aceita comentario e virgula sobrando, que e o que gente escreve', () => {
    const texto = `
      // o menu principal
      {
        "faisca": "0.1",
        "tela": "Menu",
        "nos": [
          /* o botao de jogar */
          { "id": "n1", "nome": "Jogar", "elemento": "botao", "texto": "Jogar" },
        ],
      }
    `;
    const lido = readInterface(texto);
    expect(lido.nodes).toHaveLength(1);
    expect(lido.nodes[0].texto).toBe('Jogar');
  });

  it('nao estraga uma barra dupla que esta dentro do nome', () => {
    const texto = `{ "tela": "Menu // final", "nos": [] }`;
    expect(readInterface(texto).name).toBe('Menu // final');
  });

  it('erra em portugues quando o arquivo esta quebrado', () => {
    expect(() => readInterface('{ isto nao e uma tela')).toThrow(/Faísca: não consegui ler/);
    expect(() => readInterface('{ "tela": "Menu" }')).toThrow(/lista "nos"/);
  });

  it('numero comprido nao vaza para o arquivo', () => {
    const doc = new UiDocument('Menu');
    const no = doc.add('texto');
    doc.setOffset(no.id, 0.1 + 0.2, 0);
    expect(writeInterface(doc.toData())).toContain('[0.3, 0]');
  });
});
