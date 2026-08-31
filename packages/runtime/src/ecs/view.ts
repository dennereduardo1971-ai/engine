import { type Component, NO_SLOT, type Schema } from './component.ts';
import { type Entity } from './entity.ts';

/**
 * Uma visao e a pergunta "quem tem todos estes componentes?".
 *
 * Ela percorre o componente com menos entidades e confere os outros. O laco
 * principal anda em memoria contigua e a conferencia de cada entidade e uma
 * consulta de array.
 *
 * A vaga (slot) de cada componente chega pronta no retorno de chamada, entao o
 * sistema le e escreve direto no array, sem procurar de novo:
 *
 *   const alvos = view(Transform, Velocity);
 *   alvos.each((entidade, t, v) => {
 *     Transform.fields.x[t] += Velocity.fields.x[v] * dt;
 *   });
 *
 * Duas regras que valem a pena saber:
 *
 * 1. A visao nao aloca nada. Um sistema pode chamar `each` 60 vezes por
 *    segundo sem dar trabalho ao coletor de lixo — que, quando dispara no meio
 *    de uma fase, aparece como engasgo na tela.
 * 2. A iteracao anda de tras para frente. Isso torna seguro destruir a
 *    entidade que esta sendo visitada (o caso comum: inimigo morreu, anel foi
 *    coletado). Destruir *outra* entidade no meio do laco nao e garantido:
 *    junte numa lista e destrua depois.
 */
export interface View1 {
  readonly count: number;
  each(callback: (entity: Entity, a: number) => void): void;
}
export interface View2 {
  readonly count: number;
  each(callback: (entity: Entity, a: number, b: number) => void): void;
}
export interface View3 {
  readonly count: number;
  each(callback: (entity: Entity, a: number, b: number, c: number) => void): void;
}

export function view(a: Component<Schema>): View1;
export function view(a: Component<Schema>, b: Component<Schema>): View2;
export function view(a: Component<Schema>, b: Component<Schema>, c: Component<Schema>): View3;
export function view(...components: Component<Schema>[]): {
  readonly count: number;
  each(callback: (entity: Entity, ...slots: number[]) => void): void;
} {
  const arity = components.length;
  if (arity === 0) {
    throw new Error('Faisca: uma visao precisa de pelo menos um componente.');
  }

  // Buffer reaproveitado para visoes com muitos componentes, para o caminho
  // generico tambem nao alocar por quadro.
  const args = new Array<number | Entity>(arity + 1);

  const view = {
    get count(): number {
      return smallest(components).count;
    },

    each(callback: (entity: Entity, ...slots: number[]) => void): void {
      if (arity === 1) {
        const only = components[0];
        const entities = only.entities;
        for (let i = only.count - 1; i >= 0; i--) callback(entities[i], i);
        return;
      }

      const driver = smallest(components);
      const entities = driver.entities;

      if (arity === 2) {
        const other = components[0] === driver ? components[1] : components[0];
        const driverIsFirst = components[0] === driver;
        for (let i = driver.count - 1; i >= 0; i--) {
          const entity = entities[i];
          const slot = other.slotOf(entity);
          if (slot === NO_SLOT) continue;
          if (driverIsFirst) callback(entity, i, slot);
          else callback(entity, slot, i);
        }
        return;
      }

      if (arity === 3) {
        const [a, b, c] = components;
        for (let i = driver.count - 1; i >= 0; i--) {
          const entity = entities[i];
          const sa = a === driver ? i : a.slotOf(entity);
          if (sa === NO_SLOT) continue;
          const sb = b === driver ? i : b.slotOf(entity);
          if (sb === NO_SLOT) continue;
          const sc = c === driver ? i : c.slotOf(entity);
          if (sc === NO_SLOT) continue;
          callback(entity, sa, sb, sc);
        }
        return;
      }

      for (let i = driver.count - 1; i >= 0; i--) {
        const entity = entities[i];
        args[0] = entity;
        let complete = true;
        for (let c = 0; c < arity; c++) {
          const component = components[c];
          const slot = component === driver ? i : component.slotOf(entity);
          if (slot === NO_SLOT) {
            complete = false;
            break;
          }
          args[c + 1] = slot;
        }
        if (complete) callback.apply(null, args as [Entity, ...number[]]);
      }
    },
  };

  return view;
}

function smallest(components: Component<Schema>[]): Component<Schema> {
  let best = components[0];
  for (let i = 1; i < components.length; i++) {
    if (components[i].count < best.count) best = components[i];
  }
  return best;
}
