import { describe, expect, it } from 'vitest';
import { aplicarTema, findTema, TEMAS, UiDocument } from '../src/index.ts';

describe('temas', () => {
  it('todo tema tem id unico, rotulo e ajuda', () => {
    const ids = new Set(TEMAS.map((tema) => tema.id));
    expect(ids.size).toBe(TEMAS.length);
    for (const tema of TEMAS) {
      expect(tema.label.length).toBeGreaterThan(0);
      expect(tema.hint.length).toBeGreaterThan(0);
      expect(findTema(tema.id)).toBe(tema);
    }
  });

  it('findTema devolve null para um id que nao existe', () => {
    expect(findTema('nao-existe')).toBeNull();
  });

  it('pinta cor e campos de cada no e diz quantos mudaram', () => {
    const doc = new UiDocument('Tela 1');
    const botao = doc.add('botao');
    const barra = doc.add('barra');
    const arcade = findTema('arcade');
    expect(arcade).not.toBeNull();

    expect(aplicarTema(doc, arcade!)).toBe(2);
    expect(doc.get(botao.id)?.cor).toBe(0x111318);
    expect(doc.get(botao.id)?.fields.raio).toBe(0);
    expect(doc.get(barra.id)?.cor).toBe(0x00e5ff);
  });

  it('nao mexe em no de um tipo que o tema nao conhece', () => {
    const doc = new UiDocument('Tela 1');
    const magico = doc.add('elemento-do-futuro');
    doc.setCor(magico.id, 0x123456);
    const tema = { id: 'so-botao', label: 'So botao', hint: 'teste', estilos: { botao: { cor: 0x000000 } } };

    expect(aplicarTema(doc, tema)).toBe(0);
    expect(doc.get(magico.id)?.cor).toBe(0x123456);
  });

  it('avisa o renderizador: cada no pintado emite mudanca do documento', () => {
    const doc = new UiDocument('Tela 1');
    doc.add('botao');
    const vistos: string[] = [];
    doc.on((mudanca) => vistos.push(mudanca.kind));

    aplicarTema(doc, findTema('noite')!);
    expect(vistos).toContain('appearance');
    expect(vistos).toContain('fields');
  });
});
