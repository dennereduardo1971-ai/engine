import { describe, expect, it } from 'vitest';
import { World } from '../src/ecs/world.ts';
import { Scheduler, type UpdateContext } from '../src/ecs/system.ts';
import { defineComponent } from '../src/ecs/component.ts';
import { view } from '../src/ecs/view.ts';
import { BUDGET, Profiler } from '../src/loop/profiler.ts';
import { DEFAULT_STEP } from '../src/loop/loop.ts';
import { Transform, Velocity, placeAt } from '../src/scene/components.ts';
import { transformHistorySystem, velocitySystem } from '../src/scene/systems.ts';

/**
 * Orcamento de performance verificado em teste automatico, como o plano exige
 * desde o M0 (secoes 3 e 15).
 *
 * O que da para cobrar sem placa de video: o lado da CPU — o custo por passo
 * fixo de percorrer o ECS e mexer nos dados de milhares de objetos. O teto e o
 * mesmo do plano: 4 ms de logica por quadro. O lado da GPU (chamadas de
 * desenho, triangulos, tempo de render) e medido ao vivo pelo painel da cena
 * de referencia, que e onde ele pode ser medido de verdade.
 */

const CENA = {
  /**
   * Aneis, inimigos e adornos de uma fase cheia, com folga. Uma fase de Sonic
   * de verdade fica na casa dos milhares; dez mil e o dobro do pior caso.
   */
  objetos: 10_000,
  /** Um segundo de jogo. */
  passos: 60,
};

const Orbita = defineComponent('Orbit', 'Orbita', {
  angulo: 'f32',
  raio: 'f32',
  velocidade: 'f32',
});

function montarCena(mundo: World): void {
  for (let i = 0; i < CENA.objetos; i++) {
    const entidade = mundo.create();
    placeAt(entidade, 0, 0, 0);
    const v = Velocity.add(entidade);
    Velocity.fields.y[v] = 0.5;
    const o = Orbita.add(entidade);
    Orbita.fields.angulo[o] = (i / CENA.objetos) * Math.PI * 2;
    Orbita.fields.raio[o] = 6 + (i % 60);
    Orbita.fields.velocidade[o] = 0.3;
  }
}

/** O mesmo trabalho que a cena de referencia faz por anel, por passo. */
const orbitando = view(Transform, Orbita);
const sistemaOrbita = {
  name: 'Orbita',
  phase: 'logic' as const,
  update({ dt }: UpdateContext) {
    const t = Transform.fields;
    const o = Orbita.fields;
    orbitando.each((_entidade, ts, os) => {
      const angulo = (o.angulo[os] += o.velocidade[os] * dt);
      t.x[ts] = Math.cos(angulo) * o.raio[os];
      t.z[ts] = Math.sin(angulo) * o.raio[os];
    });
  },
};

function medir(mundo: World, agendador: Scheduler, passos: number): number {
  const perfil = new Profiler();
  for (let passo = 0; passo < passos; passo++) {
    const contexto: UpdateContext = {
      world: mundo,
      dt: DEFAULT_STEP,
      elapsed: passo * DEFAULT_STEP,
      step: passo,
      frame: passo,
      alpha: 1,
    };
    perfil.begin('logic');
    agendador.run('logic', contexto);
    perfil.end('logic');
  }
  return perfil.phases.logic.average;
}

describe('orcamento de performance', () => {
  it(`${CENA.objetos.toLocaleString('pt-BR')} objetos cabem no orcamento de logica`, () => {
    const mundo = new World();
    const agendador = new Scheduler();
    agendador.add(transformHistorySystem(), mundo);
    agendador.add(velocitySystem(), mundo);
    agendador.add(sistemaOrbita, mundo);
    montarCena(mundo);

    // Aquecimento: os primeiros passos pagam a compilacao do JIT e nao
    // representam o custo em regime.
    medir(mundo, agendador, 30);
    const media = medir(mundo, agendador, CENA.passos);

    console.log(
      `  logica: ${media.toFixed(3)} ms por passo com ${CENA.objetos.toLocaleString('pt-BR')} ` +
        `objetos (orcamento: ${BUDGET.logic} ms)`,
    );
    expect(media).toBeLessThan(BUDGET.logic);
    mundo.clear();
  });

  it('a fase de logica nao vira lixo para o coletor', () => {
    // Percorrer o ECS nao pode alocar por entidade: um coletor de lixo
    // disparando no meio de uma fase e um engasgo visivel a 60 fps.
    const mundo = new World();
    const agendador = new Scheduler();
    agendador.add(sistemaOrbita, mundo);
    montarCena(mundo);
    medir(mundo, agendador, 10);

    const antes = process.memoryUsage().heapUsed;
    medir(mundo, agendador, 120);
    const depois = process.memoryUsage().heapUsed;
    const crescimentoMB = (depois - antes) / 1048576;

    console.log(`  heap depois de 120 passos: ${crescimentoMB >= 0 ? '+' : ''}${crescimentoMB.toFixed(2)} MB`);
    // Uma folga generosa: o que se cobra aqui e "nao aloca por entidade",
    // nao um numero exato, que dependeria do momento do coletor.
    expect(crescimentoMB).toBeLessThan(8);
    mundo.clear();
  });
});

describe('medidor de orcamento', () => {
  it('aponta exatamente qual teto estourou', () => {
    const perfil = new Profiler();
    perfil.phases.logic.push(9);
    perfil.drawCalls = 900;
    perfil.triangles = 10;

    const estourou = perfil.overBudget();
    expect(estourou).toContain('logica');
    expect(estourou).toContain('chamadas de desenho');
    expect(estourou).not.toContain('triangulos');
    expect(estourou).not.toContain('render');
  });

  it('nao reclama de uma cena dentro do orcamento', () => {
    const perfil = new Profiler();
    perfil.phases.logic.push(1.2);
    perfil.phases.physics.push(0.8);
    perfil.phases.render.push(5.5);
    perfil.total.push(7.5);
    perfil.drawCalls = 120;
    perfil.triangles = 90_000;
    expect(perfil.overBudget()).toEqual([]);
  });
});
