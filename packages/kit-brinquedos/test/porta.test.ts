import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_STEP,
  placeAt,
  Scheduler,
  Transform,
  type Entity,
  type UpdateContext,
  World,
} from '@faisca/runtime';
import { mandarPorta, Porta, portaAberta, portaSystem, resetPortas } from '../src/index.ts';

/**
 * A porta e o "→ abre a porta" da regra-modelo da secao 7 do plano.
 *
 * O que precisa ser verdade: ela desliza (e nao pisca), ela para no lugar
 * certo dos dois lados, e sair do teste a devolve fechada. Este ultimo e o
 * menos obvio e o mais importante: sem ele, testar a fase a consumiria.
 */
const PASSO = DEFAULT_STEP;

let mundo: World;
let agenda: Scheduler;

function passos(quantos: number): void {
  for (let i = 0; i < quantos; i++) {
    const contexto: UpdateContext = {
      world: mundo,
      dt: PASSO,
      elapsed: i * PASSO,
      step: i,
      frame: i,
      frameTime: PASSO,
      alpha: 1,
    };
    agenda.run('logic', contexto);
  }
}

function alturaDe(entidade: Entity): number {
  return Transform.fields.y[Transform.slotOf(entidade)];
}

function novaPorta(y = 0): Entity {
  const porta = mundo.create();
  placeAt(porta, 0, y, 0);
  Porta.add(porta);
  return porta;
}

beforeEach(() => {
  mundo = new World();
  mundo.clear();
  resetPortas();
  agenda = new Scheduler();
  agenda.add(portaSystem());
});

describe('a porta', () => {
  it('fica parada enquanto ninguem manda nada', () => {
    const porta = novaPorta(2);
    passos(30);
    expect(alturaDe(porta)).toBe(2);
    expect(portaAberta(porta)).toBe(false);
  });

  it('desce ao abrir, e nao some de uma vez', () => {
    const porta = novaPorta();
    const slot = Porta.slotOf(porta);
    Porta.fields.travel[slot] = 6;
    Porta.fields.speed[slot] = 6;

    mandarPorta(porta, true);
    passos(6);
    const meio = alturaDe(porta);
    // Um decimo de segundo a seis por segundo desce mais ou menos 0,6.
    expect(meio).toBeLessThan(0);
    expect(meio).toBeGreaterThan(-6);
    expect(portaAberta(porta)).toBe(false);
  });

  it('para exatamente no fim do percurso', () => {
    const porta = novaPorta(3);
    const slot = Porta.slotOf(porta);
    Porta.fields.travel[slot] = 5;
    Porta.fields.speed[slot] = 20;

    mandarPorta(porta, true);
    passos(120);
    expect(alturaDe(porta)).toBeCloseTo(-2, 5);
    expect(portaAberta(porta)).toBe(true);

    // E nao passa disso por ficar mais tempo aberta.
    passos(120);
    expect(alturaDe(porta)).toBeCloseTo(-2, 5);
  });

  it('sobe de volta ao fechar, e para na altura de origem', () => {
    const porta = novaPorta(1.5);
    Porta.fields.speed[Porta.slotOf(porta)] = 20;

    mandarPorta(porta, true);
    passos(120);
    mandarPorta(porta, false);
    passos(120);
    expect(alturaDe(porta)).toBeCloseTo(1.5, 5);
    expect(portaAberta(porta)).toBe(false);
  });

  it('mandar fechar no meio da abertura inverte o movimento', () => {
    const porta = novaPorta();
    Porta.fields.speed[Porta.slotOf(porta)] = 6;

    mandarPorta(porta, true);
    passos(12);
    const meio = alturaDe(porta);
    mandarPorta(porta, false);
    passos(6);
    expect(alturaDe(porta)).toBeGreaterThan(meio);
  });

  it('mandar abrir uma peca que nao e porta nao faz nada, e avisa', () => {
    const qualquer = mundo.create();
    placeAt(qualquer, 0, 0, 0);
    expect(mandarPorta(qualquer, true)).toBe(false);
  });

  /**
   * Sair do teste devolve a fase ao que ela era. Sem isto, a segunda vez que
   * alguem apertasse Jogar comecaria com a porta ja aberta — e a regra
   * pareceria ter parado de funcionar.
   */
  it('voltar para a edicao fecha a porta e esquece a altura guardada', () => {
    const porta = novaPorta(2);
    Porta.fields.speed[Porta.slotOf(porta)] = 20;
    mandarPorta(porta, true);
    passos(120);
    expect(alturaDe(porta)).toBeLessThan(0);

    resetPortas();
    // O editor recoloca a peca na altura do documento ao parar o teste.
    placeAt(porta, 0, 2, 0);
    passos(30);
    expect(alturaDe(porta)).toBe(2);
    expect(portaAberta(porta)).toBe(false);
  });
});
