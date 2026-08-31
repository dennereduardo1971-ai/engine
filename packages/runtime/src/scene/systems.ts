import { defineSystem, type System } from '../ecs/system.ts';
import { view } from '../ecs/view.ts';
import { Transform, Velocity } from './components.ts';

/**
 * Copia a posicao e a rotacao atuais para o passo anterior, antes de qualquer
 * sistema mexer nelas. Roda primeiro em toda a fase de logica; e o que da ao
 * render o par de estados que ele interpola.
 */
export function transformHistorySystem(): System {
  return defineSystem({
    name: 'TransformHistory',
    phase: 'logic',
    order: -1000,
    update() {
      const f = Transform.fields;
      const total = Transform.count;
      // Sem visao aqui: as vagas de 0 a count-1 sao exatamente quem tem
      // Transform, entao da para copiar array a array, direto.
      for (let slot = 0; slot < total; slot++) {
        f.px[slot] = f.x[slot];
        f.py[slot] = f.y[slot];
        f.pz[slot] = f.z[slot];
        f.pqx[slot] = f.qx[slot];
        f.pqy[slot] = f.qy[slot];
        f.pqz[slot] = f.qz[slot];
        f.pqw[slot] = f.qw[slot];
      }
    },
  });
}

/** Move quem tem Velocidade. Integracao simples, em passo fixo. */
export function velocitySystem(): System {
  const moveis = view(Transform, Velocity);
  return defineSystem({
    name: 'Velocity',
    phase: 'logic',
    update({ dt }) {
      const t = Transform.fields;
      const v = Velocity.fields;
      moveis.each((_entity, ts, vs) => {
        t.x[ts] += v.x[vs] * dt;
        t.y[ts] += v.y[vs] * dt;
        t.z[ts] += v.z[vs] * dt;
      });
    },
  });
}
