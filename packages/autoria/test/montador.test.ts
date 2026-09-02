import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_STEP,
  type Entity,
  InstancedBatch,
  loadRapier,
  ObjectRegistry,
  PhysicsWorld,
  Transform,
  type UpdateContext,
  World,
} from '@faisca/runtime';
import { Collectible, Goal, SpeedCharacter, Spring } from '@faisca/kit-velocidade';
import { Patroller } from '@faisca/kit-inimigos';
import { Porta } from '@faisca/kit-brinquedos';
import { ler, regrasDe } from '@faisca/blocos';
import {
  type AssemblerHost,
  faseDeExemplo,
  findPiece,
  localFromWorld,
  SceneAssembler,
  SceneDocument,
  worldPlacement,
} from '../src/index.ts';

/**
 * O montador e a fronteira entre editar e rodar. Nao da para testar o desenho
 * sem uma placa de video, mas da para testar o que importa: o documento e o
 * mundo ficam iguais, mudar um valor chega no componente vivo sem remontar a
 * fase, e cada peca vira colisor no lugar certo.
 */

// A fisica e wasm: precisa estar carregada antes de qualquer mundo existir.
await loadRapier();
class HospedeiroDeTeste implements AssemblerHost {
  readonly world = new World();
  readonly scene = new THREE.Group();
  readonly physics = new PhysicsWorld();
  readonly batches: InstancedBatch[] = [];
  private readonly registry = new ObjectRegistry(this.scene);

  attach(entity: Entity, object: THREE.Object3D): number {
    return this.registry.attach(entity, object);
  }

  detach(entity: Entity): void {
    this.registry.detach(entity);
  }

  createBatch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ): InstancedBatch {
    const batch = new InstancedBatch(this.batches.length, geometry, material, capacity);
    this.batches.push(batch);
    this.scene.add(batch.mesh);
    return batch;
  }
}

let host: HospedeiroDeTeste;
let doc: SceneDocument;
let montador: SceneAssembler;

beforeEach(() => {
  host = new HospedeiroDeTeste();
  host.world.clear();
  doc = new SceneDocument('Fase');
  montador = new SceneAssembler(host, doc);
});

function posicaoDe(nodeId: string): { x: number; y: number; z: number } {
  const entidade = montador.entityOf(nodeId)!;
  const slot = Transform.slotOf(entidade);
  const f = Transform.fields;
  return { x: f.x[slot], y: f.y[slot], z: f.z[slot] };
}

describe('montar e acompanhar o documento', () => {
  it('cria uma entidade por no', () => {
    doc.add('reta', { transform: { z: 4 } });
    doc.add('anel');
    montador.build();

    expect(host.world.count).toBe(2);
    expect(posicaoDe(doc.nodes[0].id).z).toBe(4);
  });

  it('mover no editor move no mundo, sem remontar', () => {
    const no = doc.add('reta');
    montador.build();
    const antes = montador.entityOf(no.id);

    doc.setTransform(no.id, { x: 8, z: 12 });

    expect(posicaoDe(no.id)).toMatchObject({ x: 8, z: 12 });
    // A mesma entidade: a peca foi movida, e nao recriada.
    expect(montador.entityOf(no.id)).toBe(antes);
  });

  it('mover o pai move o galho inteiro', () => {
    const pista = doc.add('grupo', { name: 'Pista' });
    const reta = doc.add('reta', { parent: pista.id, transform: { z: 8 } });
    montador.build();

    doc.setTransform(pista.id, { x: 20 });
    expect(posicaoDe(reta.id)).toMatchObject({ x: 20, z: 8 });

    // Girar o pai leva o filho pelo arco: 90 graus levam o +Z dele para o +X.
    doc.setTransform(pista.id, { x: 0, yaw: 90 });
    const movido = posicaoDe(reta.id);
    expect(movido.x).toBeCloseTo(8, 5);
    expect(movido.z).toBeCloseTo(0, 5);
  });

  it('apagar tira a entidade e o objeto da cena', () => {
    const no = doc.add('reta');
    montador.build();
    const objeto = montador.objectOf(no.id)!;
    expect(objeto.parent).toBe(host.scene);

    doc.remove(no.id);
    expect(montador.entityOf(no.id)).toBeUndefined();
    expect(host.world.count).toBe(0);
    expect(objeto.parent).toBe(null);
  });

  it('aneis dividem uma chamada de desenho', () => {
    for (let i = 0; i < 40; i++) doc.add('anel', { transform: { z: i } });
    montador.build();

    expect(host.batches).toHaveLength(1);
    expect(host.batches[0].count).toBe(40);
  });
});

describe('hot reload dos deslizadores', () => {
  it('mudar a velocidade maxima chega no personagem que ja esta correndo', () => {
    const partida = doc.add('inicio', { transform: { z: 2 } });
    montador.build();
    const heroi = montador.startPlay();
    const cs = SpeedCharacter.slotOf(heroi);

    const fabrica = SpeedCharacter.fields.maxSpeed[cs];
    doc.setField(partida.id, 'SpeedCharacter', 'maxSpeed', fabrica + 20);

    // Sem reiniciar a fase: o mesmo personagem, com o valor novo.
    expect(montador.hero).toBe(heroi);
    expect(SpeedCharacter.fields.maxSpeed[cs]).toBe(fabrica + 20);
  });

  it('o personagem nasce no ponto de partida', () => {
    doc.add('inicio', { transform: { x: 6, z: 12 } });
    montador.build();
    const heroi = montador.startPlay();
    const ts = Transform.slotOf(heroi);

    expect(Transform.fields.x[ts]).toBe(6);
    expect(Transform.fields.z[ts]).toBe(12);
  });

  it('parar o teste tira o personagem da fase', () => {
    doc.add('inicio');
    montador.build();
    montador.startPlay();
    expect(montador.playing).toBe(true);

    montador.stopPlay();
    expect(montador.playing).toBe(false);
    expect(SpeedCharacter.count).toBe(0);
  });
});

describe('colisor das pecas', () => {
  /**
   * De onde o personagem enxerga o chao: um raio de cima para baixo. E a
   * mesma pergunta que o Kit Velocidade faz a cada passo, feita aqui de fora.
   */
  function alturaEm(x: number, z: number, de = 50): number | null {
    const batida = host.physics.castRay({ x, y: de, z }, { x: 0, y: -1, z: 0 }, de + 20);
    return batida ? batida.point.y : null;
  }

  it('a reta vira chao solido onde ela esta, e so ali', () => {
    doc.add('reta', { transform: { y: 4 } });
    montador.build();

    // A reta tem 8 por 8 e meia unidade de grossura.
    expect(alturaEm(0, 0)).toBeCloseTo(4.5, 4);
    expect(alturaEm(3.9, 3.9)).toBeCloseTo(4.5, 4);
    expect(alturaEm(9, 0)).toBe(null);
  });

  it('a rampa sobe de uma ponta a outra', () => {
    doc.add('rampa');
    montador.build();

    const pe = alturaEm(0, -4);
    const meio = alturaEm(0, 0);
    const topo = alturaEm(0, 4);
    expect(pe).not.toBe(null);
    expect(topo).not.toBe(null);
    expect(meio!).toBeGreaterThan(pe!);
    expect(topo!).toBeGreaterThan(meio!);
  });

  it('a peca girada leva o colisor junto', () => {
    // Uma plataforma de 4 por 4 girada 45 graus: o canto que antes estava
    // fora passa a estar dentro, e vice-versa.
    doc.add('plataforma', { transform: { yaw: 45 } });
    montador.build();

    expect(alturaEm(0, 2.6)).not.toBe(null);
    expect(alturaEm(1.9, 1.9)).toBe(null);
  });

  it('a curva sustenta dentro do arco e nao no miolo', () => {
    doc.add('curva');
    montador.build();

    // Raios de 6 a 14, varrendo do +X ate o -Z. As amostras ficam dentro do
    // arco de proposito: exatamente sobre a aresta que fecha a varredura, um
    // raio vertical passa rente ao fio dos triangulos e pode escorregar entre
    // eles. Isso e limite de malha, nao buraco na pista.
    expect(alturaEm(10, -0.5)).toBeCloseTo(0.5, 4);
    expect(alturaEm(7.1, -7.1)).toBeCloseTo(0.5, 4); // meio da curva
    expect(alturaEm(0.5, -10)).toBeCloseTo(0.5, 4);
    expect(alturaEm(2, -2)).toBe(null); // miolo, dentro do raio menor
    expect(alturaEm(0, 10)).toBe(null); // fora da varredura
  });

  it('mover a peca no editor move o colisor junto', () => {
    const no = doc.add('reta');
    montador.build();
    expect(alturaEm(0, 0)).toBeCloseTo(0.5, 4);

    // Sem remontar a fase: e o hot reload da secao 8 valendo tambem para a
    // colisao. Um chao que continua onde a peca nao esta mais e um chao
    // invisivel, e o pior bug que uma engine de plataforma pode ter.
    doc.setTransform(no.id, { y: 6 });
    expect(alturaEm(0, 0)).toBeCloseTo(6.5, 4);
  });

  it('apagar a peca tira o colisor', () => {
    const no = doc.add('reta');
    montador.build();
    expect(alturaEm(0, 0)).not.toBe(null);

    doc.remove(no.id);
    expect(alturaEm(0, 0)).toBe(null);
  });
});

describe('a peça vira comportamento', () => {
  /**
   * Uma peca declara os componentes que ela tem, e o montador transforma isso
   * em componente de verdade na entidade. E este passo que separa "um anel
   * desenhado" de "um anel que se pega" — sem ele, a fase seria uma maquete.
   */
  it('o anel nasce coletável, com os valores da peça', () => {
    const no = doc.add('anel');
    montador.build();
    const entidade = montador.entityOf(no.id)!;

    const vaga = Collectible.slotOf(entidade);
    expect(vaga).toBeGreaterThanOrEqual(0);
    expect(Collectible.fields.value[vaga]).toBe(1);
    expect(Collectible.fields.radius[vaga]).toBeCloseTo(1.3, 4);
    expect(Collectible.fields.collected[vaga]).toBe(0);
  });

  it('a mola, o patrulheiro e a meta também', () => {
    const mola = doc.add('mola');
    const bicho = doc.add('patrulheiro');
    const meta = doc.add('meta');
    montador.build();

    expect(Spring.slotOf(montador.entityOf(mola.id)!)).toBeGreaterThanOrEqual(0);
    expect(Goal.slotOf(montador.entityOf(meta.id)!)).toBeGreaterThanOrEqual(0);

    const ps = Patroller.slotOf(montador.entityOf(bicho.id)!);
    expect(ps).toBeGreaterThanOrEqual(0);
    // Estado de fábrica: vivo, e com raio de contato de verdade.
    expect(Patroller.fields.alive[ps]).toBe(1);
    expect(Patroller.fields.radius[ps]).toBeGreaterThan(0);
  });

  it('o que o nó edita ganha do valor de fábrica da peça', () => {
    const no = doc.add('patrulheiro', { fields: { Patroller: { speed: 12 } } });
    montador.build();
    const ps = Patroller.slotOf(montador.entityOf(no.id)!);
    expect(Patroller.fields.speed[ps]).toBe(12);
  });

  it('o ponto de partida não fica com os componentes do personagem', () => {
    // Os deslizadores do Ponto de Partida descrevem o herói e a câmera do
    // teste, que são outras entidades: o marcador em si não é um personagem.
    const no = doc.add('inicio');
    montador.build();
    expect(SpeedCharacter.slotOf(montador.entityOf(no.id)!)).toBe(-1);
  });

  it('parar o teste devolve a fase ao estado de antes', () => {
    const anel = doc.add('anel');
    const bicho = doc.add('patrulheiro');
    doc.add('inicio');
    montador.build();
    montador.startPlay();

    const anelEntidade = montador.entityOf(anel.id)!;
    const bichoEntidade = montador.entityOf(bicho.id)!;
    Collectible.fields.collected[Collectible.slotOf(anelEntidade)] = 1;
    Transform.fields.sx[Transform.slotOf(anelEntidade)] = 0;
    Patroller.fields.alive[Patroller.slotOf(bichoEntidade)] = 0;

    montador.stopPlay();

    expect(Collectible.fields.collected[Collectible.slotOf(anelEntidade)]).toBe(0);
    expect(Transform.fields.sx[Transform.slotOf(anelEntidade)]).toBe(1);
    expect(Patroller.fields.alive[Patroller.slotOf(bichoEntidade)]).toBe(1);
  });
});

describe('arvore e mundo', () => {
  it('do mundo de volta para o pai, e o mesmo ponto', () => {
    const pai = doc.add('grupo', { transform: { x: 10, z: -4, yaw: 37 } });
    const filho = doc.add('reta', { parent: pai.id, transform: { x: 3, z: 5 } });

    const mundo = worldPlacement(doc, filho);
    const local = localFromWorld(doc, pai.id, mundo.x, mundo.y, mundo.z);

    expect(local.x).toBeCloseTo(3, 5);
    expect(local.z).toBeCloseTo(5, 5);
  });

  it('peca sem superficie nao vira colisor', () => {
    // Anel e coletavel, nao chao: atravessar um anel correndo e o esperado.
    expect(findPiece('anel')!.solid).toBe(false);
    doc.add('anel');
    montador.build();

    const batida = host.physics.castRay({ x: 0, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }, 40);
    expect(batida).toBe(null);
  });
});

describe('a fase de exemplo', () => {
  /**
   * A fase que abre junto com o editor e a primeira coisa que alguem ve. Se
   * ela tiver um buraco no meio da pista, a primeira impressao da engine e um
   * personagem despencando sem motivo. Este teste percorre a linha de corrida
   * inteira e cobra chao debaixo dela em cada passo.
   */
  it('tem chão do começo ao fim da linha de corrida', () => {
    doc.load(faseDeExemplo());
    // A Porta é uma parede de propósito, e ela cruza a linha de corrida: sem
    // tirá-la, o raio que procura o chão bateria no topo dela e o teste
    // acusaria um buraco onde há uma porta. Ela abre por regra — e é a regra,
    // e não este teste, que responde por ela abrir.
    const porta = doc.nodes.find((no) => no.piece === 'porta');
    if (porta) doc.remove(porta.id);
    montador.build();

    const linha: { x: number; z: number; altura: number }[] = [];
    // Reta A e Reta B: piso raso.
    for (let z = 0.5; z < 16; z += 1) linha.push({ x: 0, z, altura: 0.5 });
    // Rampa: sobe 4 em 8.
    for (let z = 16.5; z < 24; z += 1) {
      linha.push({ x: 0, z, altura: ((z - 16) / 8) * 4 });
    }
    // Trecho suspenso.
    for (let z = 24.5; z < 40; z += 1) linha.push({ x: 0, z, altura: 4 });
    // A curva, andando pelo meio da pista: raio 10 em volta de (10, 40).
    for (let passo = 1; passo <= 20; passo++) {
      const t = (passo / 20) * (Math.PI / 2);
      linha.push({ x: 10 - Math.cos(t) * 10, z: 40 + Math.sin(t) * 10, altura: 4 });
    }
    // Saída da curva, correndo para o +X.
    for (let x = 10.5; x < 18; x += 1) linha.push({ x, z: 50, altura: 4 });

    for (const ponto of linha) {
      const batida = host.physics.castRay(
        { x: ponto.x, y: 20, z: ponto.z },
        { x: 0, y: -1, z: 0 },
        40,
      );
      const altura = batida ? batida.point.y : Number.NaN;
      expect(
        Math.abs(altura - ponto.altura),
        `sem chão em x=${ponto.x.toFixed(1)} z=${ponto.z.toFixed(1)}: achei ${altura}, esperava ${ponto.altura.toFixed(2)}`,
      ).toBeLessThan(0.05);
    }
  });

  /**
   * A frase-modelo da secao 7 do plano, montada na fase que abre junto com o
   * editor. Ela e a primeira regra que a familia ve, entao ela precisa estar
   * inteira: a area antes da porta, e a porta no caminho.
   */
  it('traz a regra-modelo montada: área antes da porta, porta na pista', () => {
    doc.load(faseDeExemplo());
    const area = doc.nodes.find((no) => no.piece === 'area')!;
    const porta = doc.nodes.find((no) => no.piece === 'porta')!;
    expect(area).toBeDefined();
    expect(porta).toBeDefined();
    // A área vem antes da porta na direção da corrida, e não em cima dela.
    expect(area.transform.z).toBeLessThan(porta.transform.z);

    const regras = regrasDe(area.script!);
    expect(regras.escondidas).toBe(0);
    expect(regras.regras).toHaveLength(1);
    expect(regras.regras[0].evento).toBe('AoEncostar');
    expect(regras.regras[0].acoes.map((acao) => acao.bloco)).toEqual([
      'abrir',
      'tocarSom',
      'dizer',
    ]);
    // A regra aponta para a porta pelo nome que a árvore de cena mostra.
    expect(regras.regras[0].acoes[0].argumentos).toEqual([porta.name]);
  });

  it('tem um ponto de partida, e um só', () => {
    doc.load(faseDeExemplo());
    const partidas = doc.nodes.filter((no) => no.piece === 'inicio');
    expect(partidas).toHaveLength(1);
  });
});

/**
 * As regras da M6: gatilho e resposta rodando no mundo vivo.
 *
 * O que se cobra aqui e o que a secao 7 do plano promete como frase-modelo —
 * *"quando o jogador entra aqui → abre a porta e toca som"* — funcionando de
 * ponta a ponta: a zona dispara quando o jogador entra nela e nao antes, a
 * porta abre, e o caminho por onde ela barrava fica livre.
 */
describe('gatilho e resposta', () => {
  function script(codigo: string) {
    const leitura = ler(codigo, 'Peça');
    if (!leitura.ok) throw new Error(`não li: ${leitura.erro.mensagem}`);
    return leitura.script;
  }

  function contexto(passo: number): UpdateContext {
    return {
      world: host.world,
      dt: DEFAULT_STEP,
      elapsed: passo * DEFAULT_STEP,
      step: passo,
      frame: passo,
      frameTime: DEFAULT_STEP,
      alpha: 1,
    };
  }

  /** Poe o herói num lugar e roda um passo dos scripts. */
  function heroiEm(sistema: ReturnType<SceneAssembler['scriptSystem']>, x: number, z: number, passo = 0): void {
    const hs = Transform.slotOf(montador.hero);
    Transform.fields.x[hs] = x;
    Transform.fields.y[hs] = 0.6;
    Transform.fields.z[hs] = z;
    sistema.update(contexto(passo));
  }

  it('a área dispara quando o jogador entra nela, e uma vez só', () => {
    doc.add('inicio');
    doc.add('area', {
      name: 'Entrada',
      transform: { z: 20 },
      script: script('on(AoEncostar, (jogador) => {\n  dizer("entrou");\n});\n'),
    });
    montador.build();

    const ditos: string[] = [];
    montador.aoDizer = (texto) => ditos.push(texto);
    montador.startPlay();
    const sistema = montador.scriptSystem();

    // A área é 8 x 6 x 4 em torno de (0, 0, 20): longe dela, nada acontece.
    heroiEm(sistema, 0, 10, 0);
    expect(ditos).toEqual([]);

    heroiEm(sistema, 0, 20, 1);
    expect(ditos).toEqual(['entrou']);

    // Continuar dentro não dispara de novo: é borda, e não estado.
    heroiEm(sistema, 0.5, 20.5, 2);
    expect(ditos).toEqual(['entrou']);
  });

  it('sair da área dispara o par do evento', () => {
    doc.add('inicio');
    doc.add('area', {
      name: 'Entrada',
      transform: { z: 20 },
      script: script(
        'on(AoEncostar, (jogador) => {\n  dizer("entrou");\n});\n' +
          'on(AoSair, (jogador) => {\n  dizer("saiu");\n});\n',
      ),
    });
    montador.build();

    const ditos: string[] = [];
    montador.aoDizer = (texto) => ditos.push(texto);
    montador.startPlay();
    const sistema = montador.scriptSystem();

    heroiEm(sistema, 0, 20, 0);
    heroiEm(sistema, 0, 40, 1);
    expect(ditos).toEqual(['entrou', 'saiu']);
  });

  /**
   * O teste da frase inteira da secao 7. Antes da regra disparar ha parede no
   * caminho; depois, nao ha — e essa e a diferenca entre uma porta que abre e
   * uma porta que so muda de cor.
   */
  it('entrar na área abre a porta, e o caminho fica livre', () => {
    doc.add('inicio');
    const porta = doc.add('porta', { name: 'Porta', transform: { z: 24 } });
    doc.add('area', {
      name: 'Entrada',
      transform: { z: 18 },
      script: script(
        'on(AoEncostar, (jogador) => {\n  abrir("Porta");\n  tocarSom("porta");\n});\n',
      ),
    });
    montador.build();

    // Fechada, ela barra: um raio rasteiro atravessando o vão bate nela.
    const antes = host.physics.castRay({ x: 0, y: 2, z: 18 }, { x: 0, y: 0, z: 1 }, 20);
    expect(antes).not.toBeNull();

    montador.startPlay();
    const sistema = montador.scriptSystem();
    heroiEm(sistema, 0, 18, 0);

    expect(Porta.fields.alvo[Porta.slotOf(montador.entityOf(porta.id)!)]).toBe(1);
    const depois = host.physics.castRay({ x: 0, y: 2, z: 18 }, { x: 0, y: 0, z: 1 }, 20);
    expect(depois).toBeNull();
    expect(montador.errosDeScript).toEqual([]);
  });

  it('fechar de volta traz a parede de volta', () => {
    doc.add('inicio');
    doc.add('porta', { name: 'Porta', transform: { z: 24 } });
    doc.add('area', {
      name: 'Entrada',
      transform: { z: 18 },
      script: script(
        'on(AoEncostar, (jogador) => {\n  abrir("Porta");\n});\n' +
          'on(AoSair, (jogador) => {\n  fechar("Porta");\n});\n',
      ),
    });
    montador.build();
    montador.startPlay();
    const sistema = montador.scriptSystem();

    heroiEm(sistema, 0, 18, 0);
    expect(host.physics.castRay({ x: 0, y: 2, z: 18 }, { x: 0, y: 0, z: 1 }, 20)).toBeNull();

    heroiEm(sistema, 0, 0, 1);
    expect(host.physics.castRay({ x: 0, y: 2, z: 18 }, { x: 0, y: 0, z: 1 }, 20)).not.toBeNull();
  });

  it('esconder e mostrar outra peça pelo nome', () => {
    doc.add('inicio');
    const alvo = doc.add('bloco', { name: 'Caixa', transform: { x: 6 } });
    doc.add('area', {
      name: 'Entrada',
      script: script(
        'on(AoEncostar, (jogador) => {\n  esconderPeca("Caixa");\n});\n' +
          'on(AoSair, (jogador) => {\n  mostrarPeca("Caixa");\n});\n',
      ),
    });
    montador.build();
    montador.startPlay();
    const sistema = montador.scriptSystem();
    const escala = (): number => Transform.fields.sx[Transform.slotOf(montador.entityOf(alvo.id)!)];

    heroiEm(sistema, 0, 0, 0);
    expect(escala()).toBe(0);

    heroiEm(sistema, 0, 40, 1);
    expect(escala()).toBe(1);
  });

  it('o nome da peça ignora maiúsculas e acentos', () => {
    doc.add('inicio');
    const alvo = doc.add('bloco', { name: 'Árvore Mágica', transform: { x: 6 } });
    doc.add('area', {
      name: 'Entrada',
      script: script('on(AoComecar, () => {\n  esconderPeca("arvore magica");\n});\n'),
    });
    montador.build();
    montador.startPlay();
    expect(Transform.fields.sx[Transform.slotOf(montador.entityOf(alvo.id)!)]).toBe(0);
  });

  /**
   * Uma regra que aponta para uma peca apagada tem que reclamar com o nome na
   * frase. Silenciosamente nao fazer nada e o pior desfecho: quem montou a
   * regra fica procurando o problema no lugar errado.
   */
  it('apontar para uma peça que não existe vira um recado, e não um silêncio', () => {
    doc.add('inicio');
    doc.add('area', {
      name: 'Entrada',
      script: script('on(AoComecar, () => {\n  abrir("Portão do Castelo");\n});\n'),
    });
    montador.build();
    montador.startPlay();

    expect(montador.errosDeScript).toHaveLength(1);
    expect(montador.errosDeScript[0].mensagem).toContain('Portão do Castelo');
  });

  it('mandar abrir o que não é porta explica o que houve', () => {
    doc.add('inicio');
    doc.add('bloco', { name: 'Caixa' });
    doc.add('area', {
      name: 'Entrada',
      script: script('on(AoComecar, () => {\n  abrir("Caixa");\n});\n'),
    });
    montador.build();
    montador.startPlay();
    expect(montador.errosDeScript[0].mensagem).toContain('não é uma Porta');
  });

  /**
   * Um erro dentro de "a cada quadro" acontece sessenta vezes por segundo. A
   * lista de recados nao pode crescer junto — ela e para ler, e nao para
   * medir.
   */
  it('o mesmo erro, quadro após quadro, é anotado uma vez só', () => {
    doc.add('inicio');
    doc.add('area', {
      name: 'Entrada',
      script: script('on(ACadaQuadro, () => {\n  abrir("Nada");\n});\n'),
    });
    montador.build();
    montador.startPlay();
    const sistema = montador.scriptSystem();
    for (let i = 0; i < 50; i++) sistema.update(contexto(i));
    expect(montador.errosDeScript).toHaveLength(1);
  });

  it('a área some no teste e volta na edição', () => {
    doc.add('inicio');
    const area = doc.add('area', { name: 'Entrada' });
    montador.build();
    const objeto = montador.objectOf(area.id)!;
    expect(objeto.visible).toBe(true);

    montador.startPlay();
    expect(objeto.visible).toBe(false);

    montador.stopPlay();
    expect(objeto.visible).toBe(true);
  });
});
