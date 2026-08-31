import * as THREE from 'three';
import {
  BUDGET,
  defineComponent,
  defineSystem,
  Engine,
  PerfHud,
  placeAt,
  Transform,
  view,
  type Entity,
} from '@faisca/runtime';

/**
 * Cena de referencia do M0.
 *
 * O objetivo dela nao e ser bonita: e responder, com numero na mao, a pergunta
 * do plano — "esta maquina aguenta 60 fps?". Por isso ela e feita das mesmas
 * pecas que uma fase de verdade vai usar: muitos objetos iguais instanciados,
 * transformacoes movidas pelo ECS em passo fixo e um orcamento medido a cada
 * quadro.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#tela')!;
const engine = new Engine({ canvas, clearColor: 0x0e1117 });

engine.scene.fog = new THREE.Fog(0x0e1117, 40, 190);

// --- Iluminacao -------------------------------------------------------------
// Luz de ambiente + uma direcional, sem sombra. Sombra e o primeiro degrau que
// a qualidade adaptativa derruba, entao no M0 ela nem sobe.
engine.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x1a1f2b, 1.6));
const sol = new THREE.DirectionalLight(0xfff2d5, 1.5);
sol.position.set(30, 50, 20);
engine.scene.add(sol);

// --- Chao -------------------------------------------------------------------
const chao = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: 0x1b2130 }),
);
chao.rotation.x = -Math.PI / 2;
engine.scene.add(chao);

const grade = new THREE.GridHelper(400, 80, 0x2b3550, 0x232b40);
(grade.material as THREE.Material).transparent = true;
(grade.material as THREE.Material).opacity = 0.55;
engine.scene.add(grade);

// --- Componente proprio da cena --------------------------------------------
/**
 * Um anel: guarda o angulo da orbita, o raio e a altura. Em vez de uma classe
 * por anel, sao seis arrays contiguos — cinco mil aneis ficam do jeito que a
 * CPU gosta de ler.
 */
const Anel = defineComponent('Ring', 'Anel', {
  angulo: 'f32',
  raio: 'f32',
  altura: 'f32',
  velocidade: 'f32',
  giro: 'f32',
});

const aneis: Entity[] = [];

// 5 x 12 segmentos = 120 triangulos por anel. Um anel e visto de longe e em
// movimento; mais que isso e triangulo gasto sem ninguem ver.
const geometriaAnel = new THREE.TorusGeometry(0.62, 0.16, 5, 12);
const materialAnel = new THREE.MeshLambertMaterial({ color: 0xf5c542, emissive: 0x3a2a00 });
const loteAneis = engine.createBatch(geometriaAnel, materialAnel, 50_000);

function criarAneis(quantidade: number): void {
  for (let i = 0; i < quantidade; i++) {
    const entidade = engine.world.create();
    if (loteAneis.claim(entidade) < 0) {
      // Lote cheio: desfaz e para.
      engine.world.destroy(entidade);
      return;
    }
    placeAt(entidade, 0, 0, 0);
    const vaga = Anel.add(entidade);
    const f = Anel.fields;
    f.angulo[vaga] = Math.random() * Math.PI * 2;
    f.raio[vaga] = 6 + Math.random() * 60;
    f.altura[vaga] = 0.9 + Math.random() * 5;
    f.velocidade[vaga] = 0.25 + Math.random() * 0.55;
    f.giro[vaga] = 1.6 + Math.random() * 2.4;
    aneis.push(entidade);
  }
}

function limparAneis(): void {
  for (const entidade of aneis) engine.world.destroy(entidade);
  aneis.length = 0;
  loteAneis.clear();
}

/** Gira os aneis em torno do centro e em torno do proprio eixo. */
const aneisGirando = view(Transform, Anel);
engine.add(
  defineSystem({
    name: 'AnelOrbita',
    phase: 'logic',
    update({ dt, elapsed }) {
      const t = Transform.fields;
      const a = Anel.fields;
      aneisGirando.each((_entidade, ts, as) => {
        const angulo = (a.angulo[as] += a.velocidade[as] * dt);
        const raio = a.raio[as];
        t.x[ts] = Math.cos(angulo) * raio;
        t.z[ts] = Math.sin(angulo) * raio;
        t.y[ts] = a.altura[as] + Math.sin(elapsed * 1.6 + raio) * 0.35;

        // Anel de Sonic gira no proprio eixo, deitado. Quaternion em torno de Y.
        const meio = elapsed * a.giro[as] * 0.5;
        t.qx[ts] = 0;
        t.qy[ts] = Math.sin(meio);
        t.qz[ts] = 0;
        t.qw[ts] = Math.cos(meio);
      });
    },
  }),
);

// --- Um bonequinho de mentira, so para ter algo no centro -------------------
const heroi = engine.world.create();
placeAt(heroi, 0, 1.1, 0);
engine.attach(
  heroi,
  new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1, 4, 10),
    new THREE.MeshLambertMaterial({ color: 0x4f7cff }),
  ),
);

engine.add(
  defineSystem({
    name: 'HeroiPulando',
    phase: 'logic',
    update({ elapsed }) {
      const vaga = Transform.slotOf(heroi);
      if (vaga < 0) return;
      const f = Transform.fields;
      f.y[vaga] = 1.1 + Math.abs(Math.sin(elapsed * 2.2)) * 1.4;
      const meio = elapsed * 1.2;
      f.qy[vaga] = Math.sin(meio);
      f.qw[vaga] = Math.cos(meio);
    },
  }),
);

// --- Camera ----------------------------------------------------------------
// Orbita lenta, so para a cena nao ficar parada. A camera que segue a pista e
// do Kit Velocidade, no M1/M2.
const alvo = new THREE.Vector3(0, 4, 0);
engine.add(
  defineSystem({
    name: 'CameraOrbita',
    phase: 'render',
    order: -1000,
    update({ elapsed }) {
      const angulo = elapsed * 0.09;
      engine.camera.position.set(Math.cos(angulo) * 64, 24, Math.sin(angulo) * 64);
      engine.camera.lookAt(alvo);
    },
  }),
);

// --- Painel de performance --------------------------------------------------
const hud = new PerfHud(engine, document.querySelector<HTMLElement>('#palco')!);
engine.add(hud.system());

// --- Veredito: esta maquina aguenta? ---------------------------------------
const veredito = document.querySelector<HTMLElement>('#veredito')!;
let melhorAguentado = 0;

engine.add(
  defineSystem({
    name: 'Veredito',
    phase: 'render',
    order: 1001,
    update({ frame }) {
      if (frame % 20 !== 0) return;
      const { profiler } = engine;
      // Espera o historico encher para nao julgar a maquina pelos primeiros
      // quadros, que sempre incluem compilacao de shader e alocacao.
      if (profiler.frame < 60) return;

      const fps = profiler.fps;
      const estourou = profiler.overBudget();
      if (fps >= 58 && estourou.length === 0) melhorAguentado = Math.max(melhorAguentado, aneis.length);

      const classe = fps >= 58 ? 'bom' : fps >= 45 ? 'medio' : 'ruim';
      const resumo =
        estourou.length === 0
          ? `dentro do orçamento (${BUDGET.frame} ms por quadro)`
          : `estourou: ${estourou.join(', ')}`;
      veredito.innerHTML =
        `<b class="${classe}">${fps.toFixed(0)} fps com ${aneis.length.toLocaleString('pt-BR')} anéis</b>` +
        `${resumo}<br>recorde a 60 fps: ${melhorAguentado.toLocaleString('pt-BR')} anéis`;
    },
  }),
);

// --- Controles --------------------------------------------------------------
document.querySelector('#mais-mil')!.addEventListener('click', () => criarAneis(1_000));
document.querySelector('#mais-cinco')!.addEventListener('click', () => criarAneis(5_000));
document.querySelector('#limpar')!.addEventListener('click', () => {
  limparAneis();
  melhorAguentado = 0;
  engine.quality.reset();
  engine.profiler.reset();
});

const botaoAuto = document.querySelector<HTMLButtonElement>('#auto')!;
botaoAuto.addEventListener('click', () => {
  engine.quality.enabled = !engine.quality.enabled;
  botaoAuto.setAttribute('aria-pressed', String(engine.quality.enabled));
  if (!engine.quality.enabled) engine.quality.reset();
});

criarAneis(1_500); // 180 mil triangulos: dentro do teto de 250 mil
engine.start();

// Deixa a engine a mao no console do navegador, para mexer ao vivo.
Object.assign(globalThis, { faisca: engine, criarAneis, limparAneis });
