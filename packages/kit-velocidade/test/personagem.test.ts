import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_STEP,
  Input,
  loadRapier,
  PhysicsWorld,
  placeAt,
  Transform,
  World,
  type System,
  type UpdateContext,
} from '@faisca/runtime';
import { groundSpeed, makeSpeedCharacter, SpeedCharacter, speedCharacterSystem } from '../src/index.ts';

/**
 * O controlador de personagem e o sistema mais importante da engine, e o
 * plano ja avisa que acertar o "sentir" e o maior risco do projeto. Estes
 * testes nao julgam se esta gostoso de jogar — isso e no controle, na mao.
 *
 * Eles travam o que da para afirmar com numero: o teto de velocidade vale, o
 * atrito para, a derrapagem freia mais que o atrito, as folgas do pulo fazem o
 * que prometem — e, desde a M2, que a rampa cobra a subida e devolve na
 * descida, que a parede vira chao, e que o loop so se completa com velocidade.
 */

beforeAll(async () => {
  await loadRapier();
});

interface Cena {
  mundo: World;
  fisica: PhysicsWorld;
  entrada: Input;
  sistema: System;
  heroi: number;
  ts: number;
  cs: number;
  passo(quantidade?: number): void;
  posicao(): THREE.Vector3;
}

interface Opcoes {
  /** Cenario alem do chao plano. */
  cenario?(fisica: PhysicsWorld): void;
  /** Onde o personagem comeca. Padrao: em pe na origem. */
  inicio?: { x: number; y: number; z: number };
  /** Para onde a camera olha. Padrao: -Z, como no M1. */
  olhar?: THREE.Vector3;
}

function montar(opcoes: Opcoes = {}): Cena {
  const mundo = new World();
  mundo.clear();

  const fisica = new PhysicsWorld();
  // Chao plano e infinito o bastante, com o topo exatamente em y = 0.
  fisica.addBox({ x: 400, y: 1, z: 400 }, { position: { x: 0, y: -1, z: 0 } });
  opcoes.cenario?.(fisica);

  const camera = new THREE.PerspectiveCamera();
  if (opcoes.olhar) camera.lookAt(opcoes.olhar);
  camera.updateMatrixWorld();

  const entrada = new Input({ target: null, getGamepads: () => [] });
  const sistema = speedCharacterSystem({ camera, input: entrada, physics: fisica });

  const heroi = mundo.create();
  const inicio = opcoes.inicio ?? { x: 0, y: 0.62, z: 0 };
  const ts = placeAt(heroi, inicio.x, inicio.y, inicio.z);
  const cs = makeSpeedCharacter(heroi);

  let numero = 0;
  return {
    mundo,
    fisica,
    entrada,
    sistema,
    heroi,
    ts,
    cs,
    posicao() {
      const f = Transform.fields;
      return new THREE.Vector3(f.x[ts], f.y[ts], f.z[ts]);
    },
    passo(quantidade = 1) {
      for (let i = 0; i < quantidade; i++) {
        entrada.update();
        // Mesma ordem da engine: o Rapier anda, e so entao o personagem
        // consulta a arvore de colisao ja atualizada.
        fisica.step(DEFAULT_STEP);
        const contexto: UpdateContext = {
          world: mundo,
          dt: DEFAULT_STEP,
          elapsed: numero * DEFAULT_STEP,
          step: numero,
          frame: numero,
          frameTime: DEFAULT_STEP,
          alpha: 1,
        };
        const f = Transform.fields;
        f.px[ts] = f.x[ts];
        f.py[ts] = f.y[ts];
        f.pz[ts] = f.z[ts];
        sistema.update(contexto);
        numero++;
      }
    },
  };
}

/**
 * Uma rampa: um bloco fino inclinado, com o topo passando pela origem e
 * subindo na direcao -Z (que e "para frente" da camera de teste).
 */
function rampa(fisica: PhysicsWorld, graus: number): void {
  const angulo = THREE.MathUtils.degToRad(graus);
  const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angulo);
  const meia = 0.5;
  // O bloco tem 60 de comprimento; posto de modo que o topo dele encoste na
  // origem e suba andando para -Z.
  const centro = new THREE.Vector3(0, -meia, 0).applyQuaternion(giro);
  fisica.addBox(
    { x: 20, y: meia, z: 30 },
    { position: { x: centro.x, y: centro.y, z: centro.z }, rotation: giro },
  );
}

/**
 * Quanto do aro fica de fora, na saida.
 *
 * Um loop completo, encostado no chao, *nao tem entrada*: o quarto de aro que
 * desce para a saida passa rente ao chao bem no caminho de quem esta chegando,
 * e barra a passagem antes que ele alcance a base. Tirar os ultimos 45 graus
 * abre justamente essa porta: o personagem entra pela base, onde o aro e
 * tangente ao chao, e sai por um pulinho de duas unidades.
 */
const VAO_DA_SAIDA = 45;

/**
 * A superficie de dentro de um loop: uma tira de triangulos seguindo o aro,
 * tangente ao chao na base. E a peca "Loop" do editor reduzida ao que o
 * personagem toca.
 */
function loop(fisica: PhysicsWorld, raio: number, z0 = 0, largura = 8, segmentos = 96): void {
  const vertices: number[] = [];
  const indices: number[] = [];
  const volta = THREE.MathUtils.degToRad(360 - VAO_DA_SAIDA);
  for (let i = 0; i <= segmentos; i++) {
    const angulo = (i / segmentos) * volta;
    // Angulo 0 e a base, encostada no chao; anda para -Z subindo.
    const z = z0 - Math.sin(angulo) * raio;
    const y = raio - Math.cos(angulo) * raio;
    vertices.push(-largura / 2, y, z, largura / 2, y, z);
    if (i < segmentos) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  fisica.addTrimesh(new Float32Array(vertices), new Uint32Array(indices));
}

describe('personagem veloz — chao', () => {
  it('acelera para onde o analogico aponta e respeita o teto', () => {
    const cena = montar();
    cena.entrada.setKey('KeyW', true);
    cena.passo(3);

    // Para frente e -Z.
    expect(Transform.fields.z[cena.ts]).toBeLessThan(0);
    expect(groundSpeed(cena.cs)).toBeGreaterThan(0);

    cena.passo(180); // tres segundos segurando
    const maxima = SpeedCharacter.fields.maxSpeed[cena.cs];
    expect(groundSpeed(cena.cs)).toBeCloseTo(maxima, 1);
    expect(groundSpeed(cena.cs)).toBeLessThanOrEqual(maxima + 0.001);
    cena.mundo.clear();
  });

  it('fica em pe em cima do chao, e nao dentro dele', () => {
    const cena = montar({ inicio: { x: 0, y: 3, z: 0 } });
    cena.passo(90);
    const raio = SpeedCharacter.fields.radius[cena.cs];
    expect(Transform.fields.y[cena.ts]).toBeCloseTo(raio, 1);
    expect(SpeedCharacter.fields.grounded[cena.cs]).toBe(1);
    cena.mundo.clear();
  });

  it('para com atrito quando o analogico volta ao centro', () => {
    const cena = montar();
    cena.entrada.setKey('KeyW', true);
    cena.passo(60);
    expect(groundSpeed(cena.cs)).toBeGreaterThan(10);

    cena.entrada.setKey('KeyW', false);
    // O atrito e baixo de proposito (senao ladeira nenhuma empurraria nada),
    // entao ele desliza um bom pedaco antes de parar.
    cena.passo(420);
    expect(groundSpeed(cena.cs)).toBeLessThan(0.01);
    cena.mundo.clear();
  });

  it('derrapa: inverter correndo freia mais rapido do que so soltar', () => {
    const soltando = montar();
    soltando.entrada.setKey('KeyW', true);
    soltando.passo(60);
    const partida = groundSpeed(soltando.cs);
    soltando.entrada.setKey('KeyW', false);
    soltando.passo(10);
    const porAtrito = groundSpeed(soltando.cs);
    soltando.mundo.clear();

    const invertendo = montar();
    invertendo.entrada.setKey('KeyW', true);
    invertendo.passo(60);
    invertendo.entrada.setKey('KeyW', false);
    invertendo.entrada.setKey('KeyS', true);
    invertendo.passo(10);
    const porDerrapagem = groundSpeed(invertendo.cs);

    expect(partida).toBeGreaterThan(10);
    expect(porDerrapagem).toBeLessThan(porAtrito);
    invertendo.mundo.clear();
  });

  it('vira para onde esta indo', () => {
    const cena = montar();
    cena.entrada.setKey('KeyD', true); // direita = +X
    cena.passo(60);
    // Guinada 0 aponta para +Z; +X e um quarto de volta.
    expect(SpeedCharacter.fields.yaw[cena.cs]).toBeCloseTo(Math.PI / 2, 1);
    cena.mundo.clear();
  });

  it('nao atravessa parede', () => {
    const cena = montar({
      cenario: (fisica) => {
        // Uma parede atravessada no caminho, a 12 de distancia.
        fisica.addBox({ x: 20, y: 4, z: 0.5 }, { position: { x: 0, y: 4, z: -12 } });
      },
    });
    cena.entrada.setKey('KeyW', true);
    cena.passo(180);
    // Ele encosta na parede e para ali, sem passar para o outro lado.
    expect(Transform.fields.z[cena.ts]).toBeGreaterThan(-12);
    cena.mundo.clear();
  });
});

describe('personagem veloz — pulo', () => {
  it('sai do chao e volta para ele', () => {
    const cena = montar();
    const raio = SpeedCharacter.fields.radius[cena.cs];
    cena.entrada.setKey('Space', true);
    cena.passo(1);
    cena.entrada.setKey('Space', false);
    cena.passo(10);

    expect(Transform.fields.y[cena.ts]).toBeGreaterThan(raio + 0.5);
    expect(SpeedCharacter.fields.grounded[cena.cs]).toBe(0);

    cena.passo(120);
    expect(Transform.fields.y[cena.ts]).toBeCloseTo(raio, 1);
    expect(SpeedCharacter.fields.grounded[cena.cs]).toBe(1);
    cena.mundo.clear();
  });

  it('soltar o botao cedo faz um pulo mais baixo', () => {
    const curto = montar();
    curto.entrada.setKey('Space', true);
    curto.passo(1);
    curto.entrada.setKey('Space', false);
    let alturaCurta = 0;
    for (let i = 0; i < 120; i++) {
      alturaCurta = Math.max(alturaCurta, Transform.fields.y[curto.ts]);
      curto.passo(1);
    }
    curto.mundo.clear();

    const longo = montar();
    longo.entrada.setKey('Space', true);
    longo.passo(1);
    let alturaLonga = 0;
    for (let i = 0; i < 120; i++) {
      alturaLonga = Math.max(alturaLonga, Transform.fields.y[longo.ts]);
      longo.passo(1);
    }

    expect(alturaLonga).toBeGreaterThan(alturaCurta);
    longo.mundo.clear();
  });

  it('pula quem acabou de sair da beirada (coyote)', () => {
    const cena = montar({ inicio: { x: 0, y: 6, z: 0 } });
    const f = SpeedCharacter.fields;
    f.grounded[cena.cs] = 0;
    f.coyote[cena.cs] = 0.1;

    cena.entrada.setKey('Space', true);
    cena.passo(1);
    expect(f.vy[cena.cs]).toBeGreaterThan(10);
    cena.mundo.clear();
  });

  it('nao pula quem esta no ar ha tempo', () => {
    const cena = montar({ inicio: { x: 0, y: 12, z: 0 } });
    const f = SpeedCharacter.fields;
    f.grounded[cena.cs] = 0;
    f.coyote[cena.cs] = 0;

    cena.entrada.setKey('Space', true);
    cena.passo(1);
    expect(f.vy[cena.cs]).toBeLessThan(0); // so a gravidade
    cena.mundo.clear();
  });

  it('guarda o pulo apertado um pouquinho antes de encostar', () => {
    const cena = montar({ inicio: { x: 0, y: 0.8, z: 0 } });
    const f = SpeedCharacter.fields;
    f.grounded[cena.cs] = 0;
    f.coyote[cena.cs] = 0;
    f.vy[cena.cs] = -14;

    cena.entrada.setKey('Space', true);
    cena.passo(1); // apertou no ar: nao pula, mas fica guardado
    cena.entrada.setKey('Space', false);
    expect(f.grounded[cena.cs]).toBe(1); // encostou neste passo
    expect(f.vy[cena.cs]).toBeLessThanOrEqual(0.001);

    cena.passo(1); // o pulo guardado sai
    expect(f.vy[cena.cs]).toBeGreaterThan(10);
    cena.mundo.clear();
  });
});

describe('personagem veloz — superficie', () => {
  it('sobe a rampa segurando o analogico', () => {
    const cena = montar({ cenario: (fisica) => rampa(fisica, 25) });
    cena.entrada.setKey('KeyW', true);
    cena.passo(60);

    expect(SpeedCharacter.fields.grounded[cena.cs]).toBe(1);
    expect(Transform.fields.y[cena.ts]).toBeGreaterThan(3);
    cena.mundo.clear();
  });

  it('a subida cobra a velocidade de quem so vem embalado', () => {
    function embalar(comRampa: boolean): number {
      const cena = montar({ cenario: comRampa ? (f) => rampa(f, 30) : undefined });
      cena.entrada.setKey('KeyW', true);
      cena.passo(60);
      // Solta o analogico: daqui para frente e so embalo, atrito e ladeira.
      cena.entrada.setKey('KeyW', false);
      cena.passo(45);
      const velocidade = groundSpeed(cena.cs);
      cena.mundo.clear();
      return velocidade;
    }

    const noPlano = embalar(false);
    const naSubida = embalar(true);
    expect(noPlano).toBeGreaterThan(15);
    expect(naSubida).toBeLessThan(noPlano - 3);
  });

  it('a descida devolve o que a subida cobrou', () => {
    // Camera olhando para +Z: "para frente" desce a rampa.
    const cena = montar({
      cenario: (fisica) => rampa(fisica, 40),
      inicio: { x: 0, y: 12, z: -12 },
      olhar: new THREE.Vector3(0, 0, 1),
    });
    cena.passo(40); // pousa na rampa
    expect(SpeedCharacter.fields.grounded[cena.cs]).toBe(1);
    const alturaInicial = Transform.fields.y[cena.ts];

    // Sem tocar no analogico: so a inclinacao trabalha.
    cena.passo(90);
    expect(Transform.fields.y[cena.ts]).toBeLessThan(alturaInicial);
    expect(groundSpeed(cena.cs)).toBeGreaterThan(3);
    cena.mundo.clear();
  });

  it('o "para cima" dele acompanha a inclinacao do chao', () => {
    const cena = montar({ cenario: (fisica) => rampa(fisica, 30) });
    cena.entrada.setKey('KeyW', true);
    cena.passo(60);

    const f = SpeedCharacter.fields;
    expect(f.grounded[cena.cs]).toBe(1);
    // 30 graus: o "para cima" dele nao e mais o do mundo.
    const inclinacao = Math.acos(Math.min(1, f.uy[cena.cs]));
    expect(THREE.MathUtils.radToDeg(inclinacao)).toBeCloseTo(30, 0);
    cena.mundo.clear();
  });
});

describe('personagem veloz — o loop', () => {
  it('a toda, ele faz o loop inteiro e sai dele', () => {
    // Sessenta unidades de corredor antes do loop: e o que da para chegar
    // nele a toda, que e o que o loop cobra.
    const cena = montar({ cenario: (fisica) => loop(fisica, 7, -60) });
    cena.entrada.setKey('KeyW', true);
    cena.passo(120);
    expect(groundSpeed(cena.cs)).toBeGreaterThan(20);

    let alturaMaxima = 0;
    let deCabecaParaBaixo = false;
    let voltouAoChao = false;
    for (let i = 0; i < 300; i++) {
      cena.passo(1);
      const altura = Transform.fields.y[cena.ts];
      alturaMaxima = Math.max(alturaMaxima, altura);
      if (SpeedCharacter.fields.uy[cena.cs] < -0.8) deCabecaParaBaixo = true;
      if (deCabecaParaBaixo && altura < 1.5 && SpeedCharacter.fields.grounded[cena.cs] === 1) {
        voltouAoChao = true;
      }
    }

    // Passou pelo teto do loop, de cabeca para baixo, e desceu de volta ao
    // chao pelo proprio pe — que e a fatia inteira da M2 numa frase.
    expect(alturaMaxima).toBeGreaterThan(12);
    expect(deCabecaParaBaixo).toBe(true);
    expect(voltouAoChao).toBe(true);
    cena.mundo.clear();
  });

  it('devagar, ele despenca do loop', () => {
    // O loop comeca debaixo dos pes dele: entra devagar, sem corredor.
    const cena = montar({ cenario: (fisica) => loop(fisica, 7, 0) });
    const f = SpeedCharacter.fields;
    f.vz[cena.cs] = -13;

    let alturaMaxima = 0;
    let soltou = false;
    for (let i = 0; i < 240; i++) {
      cena.passo(1);
      alturaMaxima = Math.max(alturaMaxima, Transform.fields.y[cena.ts]);
      if (f.grounded[cena.cs] === 0 && alturaMaxima > 2) soltou = true;
    }

    // Subiu um pedaco, perdeu velocidade, soltou e caiu de volta.
    expect(alturaMaxima).toBeGreaterThan(1);
    expect(alturaMaxima).toBeLessThan(12);
    expect(soltou).toBe(true);
    expect(Transform.fields.y[cena.ts]).toBeLessThan(2);
    cena.mundo.clear();
  });
});

describe('personagem veloz — rolar', () => {
  it('rolando ladeira abaixo ganha mais velocidade do que de pe', () => {
    function descer(rolando: boolean): number {
      const cena = montar({
        cenario: (fisica) => rampa(fisica, 30),
        inicio: { x: 0, y: 9, z: -12 },
        olhar: new THREE.Vector3(0, 0, 1),
      });
      cena.passo(40);
      // O mesmo empurrao nos dois: so o que vem depois e diferente.
      cena.entrada.setKey('KeyW', true);
      cena.passo(20);
      cena.entrada.setKey('KeyW', false);
      if (rolando) cena.entrada.setKey('ShiftLeft', true);
      cena.passo(70);
      const velocidade = groundSpeed(cena.cs);
      cena.mundo.clear();
      return velocidade;
    }

    const dePe = descer(false);
    const rolando = descer(true);
    expect(rolando).toBeGreaterThan(dePe);
  });
});
