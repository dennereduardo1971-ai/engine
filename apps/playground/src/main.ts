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
import {
  followCameraSystem,
  groundSpeed,
  makeFollowCamera,
  makeSpeedCharacter,
  SpeedCharacter,
  speedCharacterSystem,
} from '@faisca/kit-velocidade';

/**
 * Cena de referencia — M1.
 *
 * Um bonequinho que anda com o controle de Xbox (ou com o teclado), uma camera
 * que segue sozinha e um campo de aneis instanciados. Ela responde as duas
 * perguntas das duas primeiras fatias do plano ao mesmo tempo: "da para andar
 * com o controle?" e "esta maquina aguenta 60 fps?".
 */

const canvas = document.querySelector<HTMLCanvasElement>('#tela')!;
const engine = new Engine({ canvas, clearColor: 0x0e1117 });

engine.scene.fog = new THREE.Fog(0x0e1117, 60, 240);

// --- Iluminacao -------------------------------------------------------------
engine.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x1a1f2b, 1.7));
const sol = new THREE.DirectionalLight(0xfff2d5, 1.4);
sol.position.set(30, 50, 20);
engine.scene.add(sol);

// --- Chao -------------------------------------------------------------------
const chao = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: 0x222a3d }),
);
chao.rotation.x = -Math.PI / 2;
engine.scene.add(chao);

const grade = new THREE.GridHelper(400, 100, 0x5570a8, 0x36436a);
(grade.material as THREE.Material).transparent = true;
(grade.material as THREE.Material).opacity = 0.8;
// Um fio acima do chao: coplanar com ele, a grade brigava pelo mesmo pixel e
// sumia justamente perto da camera.
grade.position.y = 0.02;
engine.scene.add(grade);


// --- O bonequinho -----------------------------------------------------------
const heroi = engine.world.create();
placeAt(heroi, 0, 0, 0);
const heroiSlot = makeSpeedCharacter(heroi);

const corpo = new THREE.Group();
const capsula = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.55, 1.1, 4, 12),
  new THREE.MeshLambertMaterial({ color: 0x4f7cff }),
);
capsula.position.y = 1.1;
corpo.add(capsula);
// Um bico na frente, so para dar para ver para onde ele esta virado.
const bico = new THREE.Mesh(
  new THREE.ConeGeometry(0.3, 0.6, 10),
  new THREE.MeshLambertMaterial({ color: 0xffd166 }),
);
bico.rotation.x = Math.PI / 2;
bico.position.set(0, 1.2, 0.62);
corpo.add(bico);
engine.attach(heroi, corpo);

engine.add(speedCharacterSystem({ camera: engine.camera, input: engine.input }));

// --- Camera que segue -------------------------------------------------------
const cameraEntidade = engine.world.create();
makeFollowCamera(cameraEntidade, heroi);
engine.add(followCameraSystem({ camera: engine.camera, input: engine.input }));

// Clicar trava o ponteiro: so assim o mouse vira controle de camera em vez de
// cursor. Esc devolve.
canvas.addEventListener('click', () => {
  if (!document.pointerLockElement) void canvas.requestPointerLock();
});

// --- Aneis ------------------------------------------------------------------
/** Um anel parado que gira no proprio eixo, como o de Sonic. */
const Anel = defineComponent('Ring', 'Anel', { giro: 'f32', fase: 'f32' });

const aneis: Entity[] = [];
// 5 x 12 segmentos = 120 triangulos por anel. Um anel e visto de longe e em
// movimento; mais que isso e triangulo gasto sem ninguem ver.
const geometriaAnel = new THREE.TorusGeometry(0.62, 0.16, 5, 12);
const materialAnel = new THREE.MeshLambertMaterial({ color: 0xf5c542, emissive: 0x3a2a00 });
const loteAneis = engine.createBatch(geometriaAnel, materialAnel, 50_000);

function porAnel(x: number, z: number): void {
  const entidade = engine.world.create();
  if (loteAneis.claim(entidade) < 0) {
    engine.world.destroy(entidade);
    return;
  }
  placeAt(entidade, x, 1.2, z);
  const vaga = Anel.add(entidade);
  Anel.fields.giro[vaga] = 2.2 + Math.random() * 1.2;
  Anel.fields.fase[vaga] = Math.random() * Math.PI * 2;
  aneis.push(entidade);
}

/** Trilhas de anel para o jogador seguir, como numa fase de verdade. */
function montarTrilhas(): void {
  for (let volta = 0; volta < 4; volta++) {
    const raio = 14 + volta * 11;
    const quantidade = 24 + volta * 10;
    for (let i = 0; i < quantidade; i++) {
      const angulo = (i / quantidade) * Math.PI * 2;
      porAnel(Math.cos(angulo) * raio, Math.sin(angulo) * raio);
    }
  }
  for (let i = 0; i < 30; i++) porAnel(0, 6 + i * 2.2);
}

/** Anel espalhado, para carregar a maquina e ver ate onde ela vai. */
function espalharAneis(quantidade: number): void {
  for (let i = 0; i < quantidade; i++) {
    const angulo = Math.random() * Math.PI * 2;
    const raio = 8 + Math.random() * 80;
    porAnel(Math.cos(angulo) * raio, Math.sin(angulo) * raio);
  }
}

function limparAneis(): void {
  for (const entidade of aneis) engine.world.destroy(entidade);
  aneis.length = 0;
  loteAneis.clear();
}

const aneisGirando = view(Transform, Anel);
engine.add(
  defineSystem({
    name: 'AnelGirando',
    phase: 'logic',
    update({ elapsed }) {
      const t = Transform.fields;
      const a = Anel.fields;
      aneisGirando.each((_entidade, ts, as) => {
        const meio = (elapsed * a.giro[as] + a.fase[as]) * 0.5;
        t.qx[ts] = 0;
        t.qy[ts] = Math.sin(meio);
        t.qz[ts] = 0;
        t.qw[ts] = Math.cos(meio);
        t.y[ts] = 1.2 + Math.sin(elapsed * 2 + a.fase[as]) * 0.12;
      });
    },
  }),
);

// --- Paineis ----------------------------------------------------------------
const hud = new PerfHud(engine, document.querySelector<HTMLElement>('#palco')!);
engine.add(hud.system());

const painelControle = document.querySelector<HTMLElement>('#controle')!;
const painelVelocidade = document.querySelector<HTMLElement>('#velocidade')!;
const barraVelocidade = document.querySelector<HTMLElement>('#barra-velocidade')!;
const veredito = document.querySelector<HTMLElement>('#veredito')!;
let melhorAguentado = 0;

engine.add(
  defineSystem({
    name: 'PainelDaCena',
    phase: 'render',
    order: 1001,
    update({ frame }) {
      if (frame % 6 !== 0) return;

      const velocidade = groundSpeed(heroiSlot);
      const maxima = SpeedCharacter.fields.maxSpeed[heroiSlot];
      painelVelocidade.textContent = `${velocidade.toFixed(1)} / ${maxima.toFixed(0)} u/s`;
      barraVelocidade.style.width = `${Math.min(100, (velocidade / maxima) * 100).toFixed(0)}%`;

      const controle = engine.input.gamepadId;
      painelControle.textContent = controle
        ? `🎮 ${controle.replace(/\s*\(.*\)\s*/g, '').trim() || 'controle'}`
        : '⌨️ nenhum controle — WASD, espaço e mouse';
      painelControle.className = controle ? 'bom' : '';

      if (frame % 24 !== 0) return;
      const { profiler } = engine;
      if (profiler.frame < 60) return;

      const fps = profiler.fps;
      const estourou = profiler.overBudget();
      if (fps >= 58 && estourou.length === 0) {
        melhorAguentado = Math.max(melhorAguentado, aneis.length);
      }
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

// --- Controles do painel ----------------------------------------------------
document.querySelector('#mais-mil')!.addEventListener('click', () => espalharAneis(1_000));
document.querySelector('#mais-cinco')!.addEventListener('click', () => espalharAneis(5_000));
document.querySelector('#limpar')!.addEventListener('click', () => {
  limparAneis();
  montarTrilhas();
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

montarTrilhas();
engine.start();

// Deixa a engine a mao no console do navegador, para mexer ao vivo.
Object.assign(globalThis, { faisca: engine, heroi, espalharAneis, limparAneis });
