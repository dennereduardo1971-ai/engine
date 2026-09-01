import * as THREE from 'three';
import {
  BUDGET,
  defineComponent,
  defineSystem,
  Engine,
  loadRapier,
  PerfHud,
  placeAt,
  Transform,
  view,
  type Entity,
  type PhysicsWorld,
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
 * Cena de referencia — M2.
 *
 * Um bonequinho que anda com o controle de Xbox (ou com o teclado), uma camera
 * que segue sozinha, um campo de aneis instanciados e — a entrega desta fatia
 * — uma rampa e um loop de verdade, com colisor de malha no Rapier.
 *
 * Ela responde de uma vez as perguntas das tres primeiras fatias do plano:
 * "esta maquina aguenta 60 fps?", "da para andar com o controle?" e "da para
 * correr num loop e sair dele?".
 */

// O construtor da engine e sincrono e cria o mundo de fisica na hora; o wasm
// do Rapier precisa ja estar em memoria quando ele roda.
await loadRapier();

const canvas = document.querySelector<HTMLCanvasElement>('#tela')!;
const engine = new Engine({ canvas, clearColor: 0x0e1117 });
const fisica = engine.physics as PhysicsWorld;

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

// O chao visto e o chao colidido. A caixa tem o topo exatamente em y = 0.
fisica.addBox({ x: 200, y: 1, z: 200 }, { position: { x: 0, y: -1, z: 0 } });

// --- Rampa e loop: a entrega do M2 ------------------------------------------

const materialPista = new THREE.MeshLambertMaterial({
  color: 0x38507e,
  side: THREE.DoubleSide,
});

/** Uma rampa: uma caixa inclinada, com o pe encostando no chao. */
// Graus negativos sobem andando para +Z, na mesma direcao do loop.
function porRampa(x: number, z: number, graus: number, comprimento = 26): void {
  const angulo = THREE.MathUtils.degToRad(graus);
  const meia = 0.4;
  const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angulo);
  // Desce meia espessura ao longo da propria normal, para o topo da rampa —
  // e nao o meio dela — passar pela origem escolhida.
  const centro = new THREE.Vector3(0, -meia, 0).applyQuaternion(giro).add(
    new THREE.Vector3(x, 0, z),
  );

  const malha = new THREE.Mesh(
    new THREE.BoxGeometry(14, meia * 2, comprimento),
    materialPista,
  );
  malha.position.copy(centro);
  malha.quaternion.copy(giro);
  engine.scene.add(malha);

  fisica.addBox(
    { x: 7, y: meia, z: comprimento / 2 },
    { position: { x: centro.x, y: centro.y, z: centro.z }, rotation: giro },
  );
}

/**
 * A superficie de dentro de um loop.
 *
 * Uma tira de triangulos seguindo o aro, tangente ao chao na base. Os ultimos
 * 45 graus ficam de fora de proposito: um aro completo encostado no chao *nao
 * tem entrada* — o quarto que desce para a saida passa rente ao chao bem no
 * caminho de quem esta chegando, e barra a passagem antes da base.
 */
function porLoop(x: number, z: number, raio = 8, largura = 9, segmentos = 96): void {
  const vertices: number[] = [];
  const indices: number[] = [];
  const volta = THREE.MathUtils.degToRad(360 - 45);
  for (let i = 0; i <= segmentos; i++) {
    const angulo = (i / segmentos) * volta;
    // Angulo 0 e a base, encostada no chao, e o aro sobe andando para +Z —
    // que e para onde a camera olha quando a fase comeca. Quem empurra o
    // analogico para frente no primeiro segundo entra no loop.
    const zi = z + Math.sin(angulo) * raio;
    const y = raio - Math.cos(angulo) * raio;
    vertices.push(x - largura / 2, y, zi, x + largura / 2, y, zi);
    if (i < segmentos) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const posicoes = new Float32Array(vertices);
  const lista = new Uint32Array(indices);

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geometria.setIndex(new THREE.BufferAttribute(lista, 1));
  geometria.computeVertexNormals();
  engine.scene.add(new THREE.Mesh(geometria, materialPista));

  fisica.addTrimesh(posicoes, lista);
}

porLoop(0, 22);
porRampa(26, 18, -18);


// --- O bonequinho -----------------------------------------------------------
const heroi = engine.world.create();
const heroiSlot = makeSpeedCharacter(heroi);
// A origem da entidade e o centro da bola que colide: ela nasce um raio acima
// do chao, senao o primeiro passo comeca dentro dele.
placeAt(heroi, 0, SpeedCharacter.fields.radius[heroiSlot], 0);

const corpo = new THREE.Group();
const capsula = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.55, 1.1, 4, 12),
  new THREE.MeshLambertMaterial({ color: 0x4f7cff }),
);
// O corpo visto pendurado na bola de colisao: o pe dele encosta onde ela
// encosta.
capsula.position.y = 0.5;
corpo.add(capsula);
// Um bico na frente, so para dar para ver para onde ele esta virado.
const bico = new THREE.Mesh(
  new THREE.ConeGeometry(0.3, 0.6, 10),
  new THREE.MeshLambertMaterial({ color: 0xffd166 }),
);
bico.rotation.x = Math.PI / 2;
bico.position.set(0, 0.6, 0.62);
corpo.add(bico);
engine.attach(heroi, corpo);

engine.add(speedCharacterSystem({ camera: engine.camera, input: engine.input, physics: fisica }));

// --- Camera que segue -------------------------------------------------------
const cameraEntidade = engine.world.create();
makeFollowCamera(cameraEntidade, heroi);
engine.add(
  followCameraSystem({ camera: engine.camera, input: engine.input, physics: fisica }),
);

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

// Deixa a engine a mao no console do navegador, para mexer ao vivo:
//   faisca.profiler.fps
//   SpeedCharacter.fields.maxSpeed[SpeedCharacter.slotOf(heroi)] = 40
Object.assign(globalThis, {
  faisca: engine,
  heroi,
  Transform,
  SpeedCharacter,
  espalharAneis,
  limparAneis,
});
