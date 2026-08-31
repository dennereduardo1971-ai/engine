import { describe, expect, it } from 'vitest';
import { World } from '../src/ecs/world.ts';
import { defineComponent, NO_SLOT } from '../src/ecs/component.ts';
import { view } from '../src/ecs/view.ts';
import { entityIndex } from '../src/ecs/entity.ts';

const Posicao = defineComponent('Position', 'Posicao', { x: 'f32', y: 'f32' });
const Vida = defineComponent('Health', 'Vida', { atual: 'i16' });
const Inimigo = defineComponent('Enemy', 'Inimigo', {});

describe('mundo e entidades', () => {
  it('cria, conta e destroi', () => {
    const mundo = new World();
    const a = mundo.create();
    const b = mundo.create();
    expect(mundo.count).toBe(2);
    expect(mundo.isAlive(a)).toBe(true);
    expect(mundo.destroy(a)).toBe(true);
    expect(mundo.isAlive(a)).toBe(false);
    expect(mundo.isAlive(b)).toBe(true);
    expect(mundo.count).toBe(1);
  });

  it('recicla o indice mas invalida a referencia antiga', () => {
    const mundo = new World();
    const antiga = mundo.create();
    mundo.destroy(antiga);
    const nova = mundo.create();

    // Mesmo lugar na memoria, identidade diferente.
    expect(entityIndex(nova)).toBe(entityIndex(antiga));
    expect(nova).not.toBe(antiga);
    expect(mundo.isAlive(antiga)).toBe(false);
    expect(mundo.isAlive(nova)).toBe(true);
  });

  it('destruir a entidade tira os componentes dela', () => {
    const mundo = new World();
    const entidade = mundo.create();
    Posicao.add(entidade);
    Vida.add(entidade);
    expect(Posicao.has(entidade)).toBe(true);

    mundo.destroy(entidade);
    expect(Posicao.has(entidade)).toBe(false);
    expect(Vida.has(entidade)).toBe(false);
    expect(Posicao.count).toBe(0);
  });
});

describe('componentes', () => {
  it('guarda valores por vaga e mantem o armazenamento denso', () => {
    const mundo = new World();
    const a = mundo.create();
    const b = mundo.create();
    const c = mundo.create();

    Posicao.fields.x[Posicao.add(a)] = 1;
    Posicao.fields.x[Posicao.add(b)] = 2;
    Posicao.fields.x[Posicao.add(c)] = 3;
    expect(Posicao.count).toBe(3);

    // Tirar o do meio move o ultimo para o buraco, sem perder o valor dele.
    Posicao.remove(b);
    expect(Posicao.count).toBe(2);
    expect(Posicao.has(b)).toBe(false);
    expect(Posicao.fields.x[Posicao.slotOf(a)]).toBe(1);
    expect(Posicao.fields.x[Posicao.slotOf(c)]).toBe(3);
    expect(Posicao.slotOf(b)).toBe(NO_SLOT);

    mundo.clear();
  });

  it('preserva os valores quando o armazenamento cresce', () => {
    const mundo = new World();
    const entidades = mundo.createMany(5_000);
    entidades.forEach((entidade, i) => {
      Posicao.fields.y[Posicao.add(entidade)] = i;
    });

    expect(Posicao.count).toBe(5_000);
    for (let i = 0; i < 5_000; i += 250) {
      expect(Posicao.fields.y[Posicao.slotOf(entidades[i])]).toBe(i);
    }
    mundo.clear();
  });

  it('aceita marcador sem dados', () => {
    const mundo = new World();
    const entidade = mundo.create();
    Inimigo.add(entidade);
    expect(Inimigo.has(entidade)).toBe(true);
    mundo.clear();
  });
});

describe('visao', () => {
  it('so entrega quem tem todos os componentes', () => {
    const mundo = new World();
    const so_posicao = mundo.create();
    const completo = mundo.create();
    const so_vida = mundo.create();

    Posicao.add(so_posicao);
    Posicao.add(completo);
    Vida.add(completo);
    Vida.add(so_vida);

    const vistos: number[] = [];
    view(Posicao, Vida).each((entidade) => vistos.push(entidade));
    expect(vistos).toEqual([completo]);
    mundo.clear();
  });

  it('entrega as vagas certas de cada componente, na ordem pedida', () => {
    const mundo = new World();
    const entidade = mundo.create();
    Posicao.fields.x[Posicao.add(entidade)] = 7;
    Vida.fields.atual[Vida.add(entidade)] = 3;

    view(Posicao, Vida).each((_entidade, p, v) => {
      expect(Posicao.fields.x[p]).toBe(7);
      expect(Vida.fields.atual[v]).toBe(3);
    });

    // Invertendo a ordem dos componentes, as vagas acompanham.
    view(Vida, Posicao).each((_entidade, v, p) => {
      expect(Posicao.fields.x[p]).toBe(7);
      expect(Vida.fields.atual[v]).toBe(3);
    });
    mundo.clear();
  });

  it('sobrevive a destruir entidades durante a iteracao', () => {
    const mundo = new World();
    const entidades = mundo.createMany(100);
    for (const entidade of entidades) Posicao.add(entidade);

    let vistos = 0;
    view(Posicao).each((entidade) => {
      vistos++;
      mundo.destroy(entidade);
    });

    expect(vistos).toBe(100);
    expect(Posicao.count).toBe(0);
    mundo.clear();
  });
});
