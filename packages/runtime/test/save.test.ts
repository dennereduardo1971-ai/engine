import { describe, expect, it } from 'vitest';
import { MemoryStorage, SaveSlot } from '../src/save/save.ts';

/**
 * Um save nunca pode quebrar o jogo. Estes testes cobram as tres formas de
 * um save dar errado — nao existe, e de outra versao, ou esta corrompido —
 * e exigem que todas terminem em "comece do zero", e nunca em erro.
 */
describe('save', () => {
  it('grava e le de volta', () => {
    const slot = new SaveSlot<{ aneis: number }>('teste', 1, { storage: new MemoryStorage() });
    expect(slot.read()).toBe(null);
    expect(slot.write({ aneis: 42 })).toBe(true);
    expect(slot.read()).toEqual({ aneis: 42 });
  });

  it('ignora save de outra versao em vez de quebrar', () => {
    const storage = new MemoryStorage();
    new SaveSlot<{ a: number }>('teste', 1, { storage }).write({ a: 1 });

    // O jogo foi atualizado e o formato mudou.
    const novo = new SaveSlot<{ a: number }>('teste', 2, { storage });
    expect(novo.read()).toBe(null);
    expect(novo.write({ a: 9 })).toBe(true);
    expect(novo.read()).toEqual({ a: 9 });
  });

  it('ignora save corrompido', () => {
    const storage = new MemoryStorage();
    storage.setItem('faisca:teste', '{isto não é json');
    expect(new SaveSlot('teste', 1, { storage }).read()).toBe(null);
  });

  it('funciona sem lugar para gravar', () => {
    // Aba anonima, navegador travado: o jogo roda, so nao guarda nada.
    const slot = new SaveSlot<{ a: number }>('teste', 1, { storage: null });
    expect(slot.available).toBe(false);
    expect(slot.write({ a: 1 })).toBe(false);
    expect(slot.read()).toBe(null);
    expect(() => slot.clear()).not.toThrow();
  });

  it('nao deixa dois jogos se atrapalharem', () => {
    const storage = new MemoryStorage();
    new SaveSlot<number>('progresso', 1, { storage, prefix: 'jogo-a' }).write(1);
    new SaveSlot<number>('progresso', 1, { storage, prefix: 'jogo-b' }).write(2);
    expect(new SaveSlot<number>('progresso', 1, { storage, prefix: 'jogo-a' }).read()).toBe(1);
    expect(new SaveSlot<number>('progresso', 1, { storage, prefix: 'jogo-b' }).read()).toBe(2);
  });

  it('apagar volta ao estado de nunca ter jogado', () => {
    const storage = new MemoryStorage();
    const slot = new SaveSlot<number>('teste', 1, { storage });
    slot.write(7);
    slot.clear();
    expect(slot.read()).toBe(null);
  });
});
