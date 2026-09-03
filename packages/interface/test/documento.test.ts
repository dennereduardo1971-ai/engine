import { describe, expect, it } from 'vitest';
import { type UiChange, UiDocument } from '../src/index.ts';

describe('UiDocument', () => {
  it('adiciona um no com valores de fabrica', () => {
    const doc = new UiDocument('Tela 1');
    const no = doc.add('botao');
    expect(no.elemento).toBe('botao');
    expect(no.name).toBe('botao');
    expect(no.parent).toBeNull();
    expect(no.ancora).toBe('topo-esquerda');
    expect(doc.count).toBe(1);
  });

  it('remove o no e os filhos pendurados nele', () => {
    const doc = new UiDocument('Tela 1');
    const painel = doc.add('painel');
    const botao = doc.add('botao', { parent: painel.id });
    doc.remove(painel.id);
    expect(doc.count).toBe(0);
    expect(doc.get(botao.id)).toBeNull();
  });

  it('recusa pendurar um no dentro do proprio galho', () => {
    const doc = new UiDocument('Tela 1');
    const pai = doc.add('painel');
    const filho = doc.add('botao', { parent: pai.id });
    expect(doc.setParent(pai.id, filho.id)).toBe(false);
    expect(doc.get(pai.id)?.parent).toBeNull();
  });

  it('emite os eventos certos para cada mudanca', () => {
    const doc = new UiDocument('Tela 1');
    const eventos: UiChange[] = [];
    doc.on((change) => eventos.push(change));

    const no = doc.add('texto');
    doc.setAncora(no.id, 'centro');
    doc.setTexto(no.id, 'Ola');
    doc.setCor(no.id, 0xff0000);
    doc.setFields(no.id, { fontSize: 32 });
    doc.rename(no.id, 'Titulo');
    doc.remove(no.id);

    expect(eventos.map((e) => e.kind)).toEqual([
      'add',
      'ancora',
      'texto',
      'appearance',
      'fields',
      'name',
      'remove',
    ]);
  });

  it('nao emite evento quando nada muda de verdade', () => {
    const doc = new UiDocument('Tela 1');
    const no = doc.add('texto', { texto: 'Ola' });
    let disparos = 0;
    doc.on(() => disparos++);

    doc.setTexto(no.id, 'Ola');
    doc.rename(no.id, no.name);
    expect(disparos).toBe(0);
  });

  it('ida e volta por toData/fromData preserva o conteudo', () => {
    const doc = new UiDocument('Menu');
    doc.add('painel');
    doc.add('botao', { texto: 'Jogar' });

    const copia = UiDocument.fromData(doc.toData());
    expect(copia.name).toBe('Menu');
    expect(copia.nodes).toEqual(doc.nodes);
  });

  it('load dispara um unico evento reload', () => {
    const doc = new UiDocument('Tela 1');
    doc.add('texto');
    const eventos: UiChange[] = [];
    doc.on((change) => eventos.push(change));

    doc.load({ format: '0.1', name: 'Tela 2', nodes: [] });
    expect(eventos).toEqual([{ kind: 'reload' }]);
    expect(doc.count).toBe(0);
  });
});
