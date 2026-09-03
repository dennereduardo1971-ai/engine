import { describe, expect, it } from 'vitest';
import { ELEMENTOS, elementoOuPlaceholder, findElemento } from '../src/index.ts';

describe('catalogo de elementos', () => {
  it('acha um elemento pelo id', () => {
    const botao = findElemento('botao');
    expect(botao).not.toBeNull();
    expect(botao?.kind).toBe('botao');
  });

  it('elemento desconhecido acha null', () => {
    expect(findElemento('nao-existe')).toBeNull();
  });

  it('elemento desconhecido vira placeholder visivel, nunca quebra', () => {
    const placeholder = elementoOuPlaceholder('nao-existe');
    expect(placeholder.id).toBe('nao-existe');
    expect(placeholder.label).toContain('nao-existe');
    expect(placeholder.kind).toBe('painel');
  });

  it('elemento conhecido nao vira placeholder', () => {
    expect(elementoOuPlaceholder('texto')).toBe(findElemento('texto'));
  });

  it('cada elemento do catalogo tem um id unico', () => {
    const ids = ELEMENTOS.map((elemento) => elemento.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
