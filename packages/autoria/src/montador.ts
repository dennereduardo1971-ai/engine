import * as THREE from 'three';
import {
  type Collider,
  componentRegistry,
  defineSystem,
  type Entity,
  type InstancedBatch,
  type PhysicsWorld,
  placeAt,
  type System,
  tocarSom,
  Transform,
  type World,
} from '@faisca/runtime';
import {
  FollowCamera,
  makeFollowCamera,
  makeSpeedCharacter,
  type Partida,
  resetTrackToys,
  SpeedCharacter,
} from '@faisca/kit-velocidade';
import { resetPatrollers } from '@faisca/kit-inimigos';
import { mandarPorta, resetPortas } from '@faisca/kit-brinquedos';
import {
  conferir,
  Instancia,
  type Ambiente,
  type ErroDeExecucao,
  type Valor,
} from '@faisca/blocos';
import { type SceneChange, type SceneDocument, type SceneNode } from './documento.ts';
import {
  type Piece,
  pieceBounds,
  pieceGeometry,
  pieceOrPlaceholder,
  scaledTrimesh,
} from './pecas.ts';
import { worldPlacement, yawQuaternion } from './transformacoes.ts';

/**
 * O montador: pega o documento de cena e faz dele um mundo vivo.
 *
 * Ele e a fronteira entre editar e rodar. De um lado, uma arvore de nos com
 * valores; do outro, entidades do ECS e objetos do Three.js. E, no meio, a
 * promessa da secao 8 do plano: **mudar um valor e ver o efeito sem reiniciar
 * a fase**. Por isso ele escuta o documento e corrige so o que mudou — mover
 * uma peca mexe numa matriz, e nao remonta a fase.
 *
 * Ele fala com um "hospedeiro" e nao com a `Engine` inteira. Assim o editor
 * passa a engine de verdade e o teste passa uma cena pelada, sem WebGL.
 */
export interface AssemblerHost {
  readonly world: World;
  readonly scene: THREE.Object3D;
  /** O mundo de colisao, ou null numa engine sem fisica. */
  readonly physics: PhysicsWorld | null;
  attach(entity: Entity, object: THREE.Object3D): number;
  detach(entity: Entity): void;
  createBatch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ): InstancedBatch;
}

/**
 * A caixa que responde por "aqui".
 *
 * Meias-medidas em torno da origem da peca, ja com a folga do corpo do
 * personagem somada. Os numeros sao locais: o teste de cada quadro leva a
 * posicao do jogador para dentro do giro da peca, e nao o contrario — assim
 * uma Area girada 30 graus continua sendo a regiao que ela parece ser.
 */
export interface Zona {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Um script vivo, ligado a peca dele. */
export interface ScriptVivo {
  node: string;
  entity: Entity;
  instancia: Instancia;
  /** O jogador esta dentro agora? Serve para disparar entrada e saida uma vez so. */
  dentro: boolean;
  zona: Zona;
}

/** Um script que deu errado, com o nome da peca para o editor mostrar. */
export interface ErroDeScript {
  node: string;
  nome: string;
  mensagem: string;
  sugestao?: string;
}

interface Built {
  node: string;
  entity: Entity;
  piece: Piece;
  object: THREE.Object3D | null;
  batch: InstancedBatch | null;
  /** Colisor da peca no Rapier, quando ela e solida. */
  collider: Collider | null;
}

/** Onde o personagem nasce quando o teste comeca. */
export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const CAPACIDADE_PADRAO = 4_000;

/**
 * Folga somada a caixa da peca: meio corpo do personagem.
 *
 * Sem ela, "chegar aqui" so dispararia quando o *centro* do personagem
 * entrasse na peca — ou seja, depois de ele ja ter atravessado a parede dela.
 */
const FOLGA = 0.7;

/**
 * Meia-medida minima de uma zona de gatilho.
 *
 * Uma peca fina (uma placa, um anel) tem caixa quase sem espessura, e uma zona
 * do tamanho exato dela seria impossivel de acertar correndo a 30 unidades por
 * segundo — o passo fixo pularia por cima dela entre um quadro e o outro.
 */
const ZONA_MINIMA = 0.9;

/** Quantos erros de script cabem numa partida antes de o montador parar de anotar. */
const MAX_ERROS = 20;

export class SceneAssembler {
  private readonly built = new Map<string, Built>();
  private readonly byEntity = new Map<Entity, string>();
  private readonly batches = new Map<string, InstancedBatch>();
  private readonly materials = new Map<string, THREE.Material>();
  private unsubscribe: (() => void) | null = null;

  /** Personagem do teste ao vivo, ou -1 fora do teste. */
  hero: Entity = -1;
  cameraEntity: Entity = -1;

  /** Os scripts rodando agora, um por peça que tem script. */
  private readonly scripts: ScriptVivo[] = [];
  /** O que os scripts reclamaram nesta partida. */
  readonly errosDeScript: ErroDeScript[] = [];
  /** Para onde vai o bloco "dizer". O editor põe o HUD aqui. */
  aoDizer: ((texto: string) => void) | null = null;
  /** O placar da partida, para os blocos de jogo. O editor liga aqui. */
  partida: Partida | null = null;

  constructor(
    private readonly host: AssemblerHost,
    private readonly document: SceneDocument,
  ) {}

  /** Monta a cena inteira e passa a acompanhar o documento. */
  build(): void {
    this.clear();
    for (const node of this.document.nodes) this.create(node);
    this.unsubscribe ??= this.document.on((change) => this.apply(change));
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopPlay();
    this.clear();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  entityOf(nodeId: string): Entity | undefined {
    return this.built.get(nodeId)?.entity;
  }

  nodeOf(entity: Entity): string | undefined {
    return this.byEntity.get(entity);
  }

  objectOf(nodeId: string): THREE.Object3D | null {
    return this.built.get(nodeId)?.object ?? null;
  }

  /** Objetos que o clique do viewport pode acertar. */
  pickables(): THREE.Object3D[] {
    const saida: THREE.Object3D[] = [];
    for (const item of this.built.values()) if (item.object) saida.push(item.object);
    for (const batch of this.batches.values()) if (batch.count > 0) saida.push(batch.mesh);
    return saida;
  }

  /** Do que o raycaster acertou para o no da arvore. */
  nodeAtHit(hit: THREE.Intersection): string | null {
    const objeto = hit.object;
    if (objeto instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      for (const batch of this.batches.values()) {
        if (batch.mesh !== objeto) continue;
        const entidade = batch.entityAt(hit.instanceId);
        return entidade === undefined ? null : (this.byEntity.get(entidade) ?? null);
      }
      return null;
    }
    const nome = objeto.userData.faiscaNode;
    return typeof nome === 'string' ? nome : null;
  }

  /** Onde o ponto de partida esta. Sem ele, a origem. */
  spawnPoint(): SpawnPoint {
    const node = this.document.firstOfPiece('inicio');
    if (!node) return { x: 0, y: 0, z: 0, yaw: 0 };
    const place = worldPlacement(this.document, node);
    return { x: place.x, y: place.y, z: place.z, yaw: place.yaw };
  }

  // --- Teste ao vivo --------------------------------------------------------

  /**
   * Poe o personagem na fase. Os deslizadores dele vem do no do ponto de
   * partida — e por isso mexer neles com o jogo rodando muda o personagem na
   * hora, sem reiniciar.
   */
  startPlay(): Entity {
    this.stopPlay();
    const partida = this.spawnPoint();
    const node = this.document.firstOfPiece('inicio');

    const hero = this.host.world.create();
    placeAt(hero, partida.x, partida.y + 0.2, partida.z);
    const slot = makeSpeedCharacter(hero);
    SpeedCharacter.fields.yaw[slot] = partida.yaw;
    if (node) applyFieldsTo(hero, node.fields.SpeedCharacter, SpeedCharacter.name);
    this.host.attach(hero, heroObject());

    const camera = this.host.world.create();
    const cameraSlot = makeFollowCamera(camera, hero);
    FollowCamera.fields.yaw[cameraSlot] = partida.yaw;
    if (node) applyFieldsTo(camera, node.fields.FollowCamera, FollowCamera.name);

    this.hero = hero;
    this.cameraEntity = camera;
    // A Area e o contorno dela sao andaime de quem monta a fase, e nao parte
    // dela. Quem esta jogando nao pode ver uma caixa azul flutuando na pista.
    this.mostrarMarcacoes(false);
    this.acenderScripts();
    return hero;
  }

  /** Liga ou desliga as pecas que so existem no editor. */
  private mostrarMarcacoes(visiveis: boolean): void {
    for (const built of this.built.values()) {
      if (built.piece.soNoEditor && built.object) built.object.visible = visiveis;
    }
  }

  /**
   * Cria um script vivo por peca que tem script, e dispara "AoComecar".
   *
   * O que o conferidor reclamar entra em `errosDeScript` e a peca fica de
   * fora. Um script com erro nao pode derrubar o teste da fase inteira: quem
   * escreveu precisa poder rodar o resto e ver o recado.
   */
  private acenderScripts(): void {
    this.errosDeScript.length = 0;
    this.scripts.length = 0;

    for (const node of this.document.nodes) {
      const script = node.script;
      if (!script || script.corpo.length === 0) continue;
      const built = this.built.get(node.id);
      if (!built) continue;

      const problemas = conferir(script);
      if (problemas.length > 0) {
        this.errosDeScript.push({
          node: node.id,
          nome: node.name,
          mensagem: problemas[0].mensagem,
          sugestao: problemas[0].sugestao,
        });
        continue;
      }

      const instancia = new Instancia(script, this.ambienteDe(node, built.entity));
      const vivo: ScriptVivo = {
        node: node.id,
        entity: built.entity,
        instancia,
        dentro: false,
        // A zona e medida uma vez, no comeco da partida, e a partir dai ela
        // acompanha a peca pelo Transform. Uma peca que se move leva a zona
        // junto; uma peca redimensionada no meio do teste, nao — e o preco de
        // nao remedir a caixa sessenta vezes por segundo.
        zona: zonaDe(built.piece, this.document, node),
      };
      this.scripts.push(vivo);
      this.anotarErro(vivo, instancia.iniciar());
      this.anotarErro(vivo, instancia.disparar('AoComecar'));
    }
  }

  /**
   * O mundo, do ponto de vista de um script.
   *
   * Cada peca ganha o seu: `meuX` e o x *dela*, e `mover` move *ela*. E isso
   * que deixa o mesmo script servir para dez inimigos sem nenhum deles saber
   * que os outros existem.
   */
  private ambienteDe(node: SceneNode, entity: Entity): Ambiente {
    const t = Transform.fields;
    const vaga = (): number => Transform.slotOf(entity);

    const girarPara = (ts: number, yaw: number): void => {
      const meio = yaw * 0.5;
      t.qx[ts] = 0;
      t.qy[ts] = Math.sin(meio);
      t.qz[ts] = 0;
      t.qw[ts] = Math.cos(meio);
    };

    const distanciaAteOHeroi = (ts: number): number => {
      const hs = this.hero >= 0 ? Transform.slotOf(this.hero) : -1;
      if (hs < 0) return Infinity;
      return Math.hypot(t.x[hs] - t.x[ts], t.y[hs] - t.y[ts], t.z[hs] - t.z[ts]);
    };

    return {
      chamar: (nome: string, argumentos: Valor[]): Valor | void => {
        const numero = (i: number): number => {
          const valor = argumentos[i];
          return typeof valor === 'number' ? valor : Number(valor) || 0;
        };
        const texto = (i: number): string => String(argumentos[i] ?? '');
        const ts = vaga();
        // Quase todo bloco age em quem tem o script, e sem vaga no Transform
        // nao ha em quem agir. Os blocos que falam de fora — som, recado e os
        // que apontam para outra peca — nao dependem dela.
        if (ts < 0 && !SEM_VAGA.has(nome)) return 0;

        switch (nome) {
          case 'mover':
            t.x[ts] += numero(0);
            t.y[ts] += numero(1);
            t.z[ts] += numero(2);
            return;
          case 'irPara':
            t.x[ts] = numero(0);
            t.y[ts] = numero(1);
            t.z[ts] = numero(2);
            return;
          case 'girar': {
            const atual = Math.atan2(t.qy[ts], t.qw[ts]) * 2;
            girarPara(ts, atual + (numero(0) * Math.PI) / 180);
            return;
          }
          case 'empurrar': {
            if (this.hero < 0) return;
            const cs = SpeedCharacter.slotOf(this.hero);
            if (cs < 0) return;
            SpeedCharacter.fields.vy[cs] = numero(0);
            SpeedCharacter.fields.grounded[cs] = 0;
            SpeedCharacter.fields.noStick[cs] = 0.25;
            return;
          }
          case 'darAneis':
            this.partida?.coletar(Math.max(0, Math.round(numero(0))));
            return;
          case 'tirarVida':
            this.partida?.levarDano();
            return;
          case 'terminarFase':
            this.partida?.vencer();
            return;
          case 'esconder':
            this.sumir(node);
            return;
          case 'mostrar':
            this.trazer(node);
            return;

          // --- Blocos que apontam para outra peca --------------------------
          //
          // Eles acham a peca pelo *nome* que aparece na arvore de cena, e nao
          // por um identificador. E de proposito: o nome e a unica coisa que
          // quem monta a fase ve e escolhe. Renomear a peca quebra a regra —
          // e por isso o painel de regras oferece uma lista, e nao um campo de
          // texto: escolhendo da lista, nao ha como errar o nome.
          case 'esconderPeca':
            this.sumir(this.exigirNo(texto(0)));
            return;
          case 'mostrarPeca':
            this.trazer(this.exigirNo(texto(0)));
            return;
          case 'abrir':
            this.mexerNaPorta(this.exigirNo(texto(0)), true);
            return;
          case 'fechar':
            this.mexerNaPorta(this.exigirNo(texto(0)), false);
            return;

          case 'tocarSom':
            tocarSom(texto(0));
            return;
          case 'dizer':
            this.aoDizer?.(String(argumentos[0] ?? ''));
            return;
          case 'meuX':
            return t.x[ts];
          case 'meuY':
            return t.y[ts];
          case 'meuZ':
            return t.z[ts];
          case 'aneis':
            return this.partida?.aneis ?? 0;
          case 'tempo':
            return this.partida?.tempo ?? 0;
          case 'distanciaDoJogador':
            return distanciaAteOHeroi(ts);
          case 'aleatorio': {
            const minimo = Math.round(numero(0));
            const maximo = Math.round(numero(1));
            const menor = Math.min(minimo, maximo);
            const maior = Math.max(minimo, maximo);
            return menor + Math.floor(Math.random() * (maior - menor + 1));
          }
          default:
            throw new Error(`Não conheço o bloco "${nome}".`);
        }
      },
      constante: (nome: string): Valor | undefined => {
        if (nome === 'CIMA') return 1;
        if (nome === 'BAIXO') return -1;
        return undefined;
      },
    };
  }

  /**
   * Guarda o que um script reclamou.
   *
   * Sem repetir e com teto, e isso importa mais do que parece: um erro dentro
   * de "a cada quadro" acontece sessenta vezes por segundo, e uma lista que
   * cresce sem limite viraria centenas de milhares de linhas iguais em um
   * minuto de teste — comendo memoria por um recado que ja foi dado na
   * primeira vez.
   */
  /**
   * Acha uma peca pelo nome que aparece na arvore de cena.
   *
   * A comparacao ignora maiusculas e acentos: quem digitou "porta" no lugar de
   * "Porta" quis dizer a mesma coisa, e recusar isso seria transformar um
   * detalhe de teclado num bug de jogo.
   */
  acharNoPorNome(nome: string): SceneNode | null {
    const alvo = simplificar(nome);
    if (!alvo) return null;
    let aproximado: SceneNode | null = null;
    for (const node of this.document.nodes) {
      if (node.name === nome) return node;
      if (!aproximado && simplificar(node.name) === alvo) aproximado = node;
    }
    return aproximado;
  }

  /**
   * A peca com aquele nome, ou um erro que diz o que fazer.
   *
   * Erro, e nao silencio: uma regra que aponta para uma peca apagada tem que
   * reclamar. Silenciosamente nao fazer nada e o pior desfecho possivel —
   * quem montou a regra fica procurando o problema no lugar errado.
   */
  private exigirNo(nome: string): SceneNode {
    const node = this.acharNoPorNome(nome);
    if (!node) {
      throw new Error(
        nome
          ? `Não achei nenhuma peça chamada "${nome}" nesta fase.`
          : 'Este bloco não diz em qual peça ele deve mexer.',
      );
    }
    return node;
  }

  /** Tira a peca da vista e do caminho. */
  private sumir(node: SceneNode): void {
    const built = this.built.get(node.id);
    if (!built) return;
    const ts = Transform.slotOf(built.entity);
    if (ts >= 0) {
      const t = Transform.fields;
      t.sx[ts] = t.sy[ts] = t.sz[ts] = 0;
    }
    // Sumir da vista tem que sumir do caminho tambem. Uma peca invisivel que
    // ainda barra o jogador e um bug que ninguem consegue ver — literalmente.
    if (built.collider) {
      this.host.physics?.removeCollider(built.collider);
      built.collider = null;
    }
  }

  /** Devolve a peca ao tamanho e ao colisor que ela tem no documento. */
  private trazer(node: SceneNode): void {
    const built = this.built.get(node.id);
    if (!built) return;
    const ts = Transform.slotOf(built.entity);
    if (ts >= 0) {
      const place = worldPlacement(this.document, node);
      const t = Transform.fields;
      t.sx[ts] = place.sx;
      t.sy[ts] = place.sy;
      t.sz[ts] = place.sz;
    }
    if (!built.collider) this.rebuildCollider(node, built);
  }

  /**
   * Manda uma porta abrir ou fechar.
   *
   * O colisor vai e volta no instante do comando, e nao no fim do movimento.
   * E uma escolha, e ela tem um custo visivel: durante os dois tercos de
   * segundo em que a porta desliza, da para atravessar o que ainda esta na
   * frente. O contrario custaria mais: uma porta que ja abriu na tela e ainda
   * barra a passagem faz quem esta jogando achar que a regra nao funcionou.
   */
  private mexerNaPorta(node: SceneNode, abrir: boolean): void {
    const built = this.built.get(node.id);
    if (!built) return;
    if (!mandarPorta(built.entity, abrir)) {
      throw new Error(`"${node.name}" não é uma Porta, então não dá para abrir nem fechar.`);
    }
    if (abrir) {
      if (built.collider) {
        this.host.physics?.removeCollider(built.collider);
        built.collider = null;
      }
    } else if (!built.collider) {
      this.rebuildCollider(node, built);
    }
  }

  private anotarErro(vivo: ScriptVivo, erro: ErroDeExecucao | null): void {
    if (!erro) return;
    if (this.errosDeScript.length >= MAX_ERROS) return;
    const repetido = this.errosDeScript.some(
      (anotado) => anotado.node === vivo.node && anotado.mensagem === erro.mensagem,
    );
    if (repetido) return;
    const node = this.document.get(vivo.node);
    this.errosDeScript.push({
      node: vivo.node,
      nome: node?.name ?? vivo.node,
      mensagem: erro.mensagem,
      sugestao: erro.sugestao,
    });
  }

  stopPlay(): void {
    if (this.hero >= 0) {
      this.host.detach(this.hero);
      this.host.world.destroy(this.hero);
      this.hero = -1;
    }
    if (this.cameraEntity >= 0) {
      this.host.world.destroy(this.cameraEntity);
      this.cameraEntity = -1;
    }

    // Sair do teste devolve a fase ao que ela era: anel pego volta, inimigo
    // derrotado levanta, mola disparada descarrega. Sem isto, testar a fase a
    // consumiria — a segunda vez que a mae apertasse Jogar, metade dos aneis
    // teria sumido do projeto dela.
    this.scripts.length = 0;
    resetTrackToys();
    resetPatrollers();
    resetPortas();
    this.mostrarMarcacoes(true);
    for (const node of this.document.nodes) this.place(node);
  }

  get playing(): boolean {
    return this.hero >= 0;
  }

  /**
   * O sistema que faz os scripts andarem.
   *
   * Ele dispara "a cada quadro" em todo script vivo, e o par de bordas da
   * zona: **chegar aqui** quando o jogador entra, **sair daqui** quando ele
   * sai. Bordas, e nao estados — uma vez por chegada e uma por saida, e nao a
   * cada quadro em que ele ainda esta dentro. Sem isso, encostar num inimigo
   * com um "tirar uma vida" dentro tiraria sessenta vidas por segundo.
   *
   * O teste e uma caixa, e nao um raio: desde a M6 a peca Area e o "aqui" da
   * regra-modelo da secao 7, e uma area comprida com um raio no meio nao seria
   * a regiao que ela desenha na tela.
   */
  scriptSystem(): System {
    return defineSystem({
      name: 'Scripts',
      phase: 'logic',
      order: 120,
      update: () => {
        if (this.scripts.length === 0) return;
        const t = Transform.fields;
        const hs = this.hero >= 0 ? Transform.slotOf(this.hero) : -1;

        for (const vivo of this.scripts) {
          this.anotarErro(vivo, vivo.instancia.disparar('ACadaQuadro'));

          if (hs < 0) continue;
          const ts = Transform.slotOf(vivo.entity);
          if (ts < 0) continue;

          const dentro = dentroDaZona(
            vivo.zona,
            t.x[ts],
            t.y[ts],
            t.z[ts],
            t.qy[ts],
            t.qw[ts],
            t.x[hs],
            t.y[hs],
            t.z[hs],
          );
          if (dentro && !vivo.dentro) {
            this.anotarErro(vivo, vivo.instancia.disparar('AoEncostar', 'jogador'));
          } else if (!dentro && vivo.dentro) {
            this.anotarErro(vivo, vivo.instancia.disparar('AoSair', 'jogador'));
          }
          vivo.dentro = dentro;
        }
      },
    });
  }

  // --- Reagir ao documento --------------------------------------------------

  private apply(change: SceneChange): void {
    switch (change.kind) {
      case 'add': {
        const node = this.document.get(change.id);
        if (node) this.create(node);
        break;
      }
      case 'remove':
        this.destroy(change.id);
        break;
      case 'transform':
      case 'parent':
        // Mover o pai move o galho inteiro.
        for (const node of this.document.branch(change.id)) this.place(node);
        break;
      case 'fields':
        this.applyFields(change.id, change.component);
        break;
      case 'appearance': {
        // Cor e visibilidade mexem no material e na vaga do lote: refazer o
        // objeto e mais simples (e igualmente rapido) do que remendar os dois.
        const node = this.document.get(change.id);
        this.destroy(change.id);
        if (node) this.create(node);
        break;
      }
      case 'name':
        break;
      case 'reload':
        this.build();
        break;
    }
  }

  private create(node: SceneNode): void {
    if (this.built.has(node.id)) this.destroy(node.id);
    const piece = pieceOrPlaceholder(node.piece);
    const entity = this.host.world.create();
    const built: Built = {
      node: node.id,
      entity,
      piece,
      object: null,
      batch: null,
      collider: null,
    };

    if (piece.mesh.kind !== 'grupo' && node.visible) {
      if (piece.instanced) {
        const batch = this.batchFor(piece);
        if (batch.claim(entity) >= 0) built.batch = batch;
      } else {
        const objeto = new THREE.Mesh(pieceGeometry(piece), this.materialFor(piece, node.color));
        objeto.userData.faiscaNode = node.id;
        this.host.attach(entity, objeto);
        built.object = objeto;
      }
    }

    // Os componentes que a peca declara viram componentes de verdade na
    // entidade. E isto que transforma "um anel desenhado" em "um anel que se
    // pega": o comportamento mora no kit, e a peca so diz qual deles ela tem.
    //
    // O ponto de partida e a excecao: os componentes dele descrevem o
    // personagem e a camera do teste, que sao outras entidades.
    if (node.piece !== 'inicio') {
      for (const nome of Object.keys(piece.components)) {
        const componente = componentRegistry.find((candidato) => candidato.name === nome);
        componente?.add(entity);
      }
    }

    this.built.set(node.id, built);
    this.byEntity.set(entity, node.id);
    this.place(node);
    // Primeiro os valores de fabrica da peca, depois o que foi editado no no.
    if (node.piece !== 'inicio') {
      for (const [nome, valores] of Object.entries(piece.components)) {
        applyFieldsTo(entity, valores, nome);
      }
    }
    this.applyFields(node.id, null);
  }

  private destroy(nodeId: string): void {
    const built = this.built.get(nodeId);
    if (!built) return;
    if (built.collider) {
      this.host.physics?.removeCollider(built.collider);
      built.collider = null;
    }
    built.batch?.release(built.entity);
    if (built.object) this.host.detach(built.entity);
    this.host.world.destroy(built.entity);
    this.byEntity.delete(built.entity);
    this.built.delete(nodeId);
  }

  /** Escreve a posicao de mundo do no no Transform da entidade. */
  private place(node: SceneNode): void {
    const built = this.built.get(node.id);
    if (!built) return;
    const place = worldPlacement(this.document, node);
    let ts = Transform.slotOf(built.entity);
    if (ts < 0) ts = placeAt(built.entity, place.x, place.y, place.z);
    const f = Transform.fields;
    const giro = yawQuaternion(place.yaw);
    // Passo anterior junto com o atual: uma peca movida no editor tem que
    // aparecer no lugar novo, e nao riscar a tela desde o lugar velho.
    f.x[ts] = f.px[ts] = place.x;
    f.y[ts] = f.py[ts] = place.y;
    f.z[ts] = f.pz[ts] = place.z;
    f.qx[ts] = f.pqx[ts] = giro.x;
    f.qy[ts] = f.pqy[ts] = giro.y;
    f.qz[ts] = f.pqz[ts] = giro.z;
    f.qw[ts] = f.pqw[ts] = giro.w;
    f.sx[ts] = place.sx;
    f.sy[ts] = place.sy;
    f.sz[ts] = place.sz;

    this.rebuildCollider(node, built);
  }

  /**
   * Refaz o colisor da peca no lugar onde ela esta agora.
   *
   * Colisor de malha nao tem escala propria no Rapier — a escala vive nos
   * vertices. Entao mover, girar ou redimensionar uma peca no editor refaz o
   * colisor inteiro, e nao remenda o antigo. Custa uma malha por mexida, e
   * paga com a garantia de que o que se ve e o que se colide: uma pista que
   * parece uma coisa e colide como outra e o pior bug possivel numa engine de
   * plataforma.
   */
  private rebuildCollider(node: SceneNode, built: Built): void {
    const physics = this.host.physics;
    if (built.collider) {
      physics?.removeCollider(built.collider);
      built.collider = null;
    }
    if (!physics || !node.visible) return;

    const place = worldPlacement(this.document, node);
    const malha = scaledTrimesh(built.piece, place.sx, place.sy, place.sz);
    if (!malha) return;

    built.collider = physics.addTrimesh(malha.vertices, malha.indices, {
      position: { x: place.x, y: place.y, z: place.z },
      rotation: yawQuaternion(place.yaw),
    });
  }

  /**
   * Leva os valores editados para os componentes vivos. E aqui que o hot
   * reload acontece de verdade: o campo mudou no documento, e o componente que
   * o sistema vai ler no proximo passo ja esta com o valor novo.
   */
  private applyFields(nodeId: string, component: string | null): void {
    const node = this.document.get(nodeId);
    if (!node) return;

    // O ponto de partida guarda os deslizadores do personagem e da camera, que
    // moram em outras entidades — as do teste, que so existem enquanto joga.
    if (node.piece === 'inicio') {
      if (this.hero >= 0 && (component === null || component === SpeedCharacter.name)) {
        applyFieldsTo(this.hero, node.fields.SpeedCharacter, SpeedCharacter.name);
      }
      if (this.cameraEntity >= 0 && (component === null || component === FollowCamera.name)) {
        applyFieldsTo(this.cameraEntity, node.fields.FollowCamera, FollowCamera.name);
      }
      return;
    }

    const built = this.built.get(nodeId);
    if (!built) return;
    for (const [nome, valores] of Object.entries(node.fields)) {
      if (component !== null && nome !== component) continue;
      applyFieldsTo(built.entity, valores, nome);
    }
  }

  private batchFor(piece: Piece): InstancedBatch {
    const existente = this.batches.get(piece.id);
    if (existente) return existente;
    const batch = this.host.createBatch(
      // Uma copia: o lote se desfaz da propria geometria quando a engine
      // fecha, e ela nao pode ser a que o cache das pecas empresta a todo
      // mundo.
      pieceGeometry(piece).clone(),
      this.materialFor(piece, null),
      piece.capacity ?? CAPACIDADE_PADRAO,
    );
    this.batches.set(piece.id, batch);
    return batch;
  }

  /**
   * Um material por cor. Cor propria so vale em peca nao instanciada: quem
   * esta num lote divide o material com todo mundo do lote, que e justamente o
   * que faz o lote ser uma chamada de desenho so.
   */
  private materialFor(piece: Piece, color: number | null): THREE.Material {
    const cor = piece.instanced ? piece.color : (color ?? piece.color);
    const chave = `${piece.id}:${cor}`;
    const existente = this.materials.get(chave);
    if (existente) return existente;
    const material = new THREE.MeshLambertMaterial({
      color: cor,
      emissive: piece.id === 'anel' ? 0x3a2a00 : 0x000000,
      // A curva e uma casca fina: sem os dois lados, ela some vista de baixo.
      side: piece.mesh.kind === 'curva' ? THREE.DoubleSide : THREE.FrontSide,
      // Peca de marcacao e vidro: da para ver onde ela esta e ver o que esta
      // atras dela. Sem escrever no buffer de profundidade, ela tambem nao
      // esconde a pista que passa por dentro.
      ...(piece.soNoEditor
        ? { transparent: true, opacity: 0.22, depthWrite: false }
        : {}),
    });
    this.materials.set(chave, material);
    return material;
  }

  private clear(): void {
    for (const nodeId of [...this.built.keys()]) this.destroy(nodeId);
    for (const batch of this.batches.values()) batch.clear();
  }
}

/** Blocos que funcionam mesmo sem a peca ter vaga no Transform. */
const SEM_VAGA = new Set([
  'dizer',
  'tocarSom',
  'abrir',
  'fechar',
  'esconderPeca',
  'mostrarPeca',
]);

/**
 * A caixa de gatilho de uma peca, em coordenadas locais e com a folga somada.
 *
 * Sai da caixa que envolve a malha — ou seja, da forma que a peca realmente
 * tem — multiplicada pela escala do no. Uma Area esticada para cobrir a
 * entrada de um tunel dispara na entrada inteira, e nao num ponto no meio.
 */
export function zonaDe(piece: Piece, document: SceneDocument, node: SceneNode): Zona {
  const caixa = pieceBounds(piece);
  const place = worldPlacement(document, node);
  const eixo = (
    min: number,
    max: number,
    escala: number,
  ): { min: number; max: number } => {
    let baixo = min * escala - FOLGA;
    let alto = max * escala + FOLGA;
    // Peca fina ganha uma zona minima em torno do meio dela, para dar para
    // acertar correndo.
    const meio = (baixo + alto) / 2;
    if (alto - baixo < ZONA_MINIMA * 2) {
      baixo = meio - ZONA_MINIMA;
      alto = meio + ZONA_MINIMA;
    }
    return { min: baixo, max: alto };
  };

  const x = eixo(caixa.min.x, caixa.max.x, place.sx);
  const y = eixo(caixa.min.y, caixa.max.y, place.sy);
  const z = eixo(caixa.min.z, caixa.max.z, place.sz);
  return { minX: x.min, minY: y.min, minZ: z.min, maxX: x.max, maxY: y.max, maxZ: z.max };
}

/**
 * O jogador esta dentro da zona da peca?
 *
 * O giro da peca entra pelo quaternion de guinada (`qy`, `qw`) e nao por uma
 * matriz: as pecas do editor so giram em torno do Y, e desfazer uma guinada e
 * um seno e um cosseno. Uma matriz inversa por peca por quadro seria pagar
 * caro por uma generalidade que o formato de cena nem guarda.
 */
export function dentroDaZona(
  zona: Zona,
  px: number,
  py: number,
  pz: number,
  qy: number,
  qw: number,
  x: number,
  y: number,
  z: number,
): boolean {
  const dy = y - py;
  if (dy < zona.minY || dy > zona.maxY) return false;

  const dx = x - px;
  const dz = z - pz;
  const yaw = Math.atan2(qy, qw) * 2;
  const cos = Math.cos(yaw);
  const sen = Math.sin(yaw);
  // Giro ao contrario: leva o jogador para o sistema de coordenadas da peca.
  const lx = dx * cos - dz * sen;
  const lz = dx * sen + dz * cos;
  return lx >= zona.minX && lx <= zona.maxX && lz >= zona.minZ && lz <= zona.maxZ;
}

/** Sem maiusculas e sem acento, para comparar nome digitado com nome de peca. */
function simplificar(nome: string): string {
  return nome
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Escreve valores num componente pelo nome, se a entidade tiver o componente. */
function applyFieldsTo(
  entity: Entity,
  values: Record<string, number> | undefined,
  componentName: string,
): void {
  if (!values) return;
  const component = componentRegistry.find((candidate) => candidate.name === componentName);
  if (!component) return;
  const slot = component.slotOf(entity);
  if (slot < 0) return;
  const fields = component.fields as Record<string, { [index: number]: number } | undefined>;
  for (const [campo, valor] of Object.entries(values)) {
    const array = fields[campo];
    if (array && Number.isFinite(valor)) array[slot] = valor;
  }
}

let heroCache: THREE.Object3D | null = null;

/**
 * O bonequinho do teste: uma capsula e um bico para ver para onde ele olha.
 *
 * Feito uma vez so e reaproveitado: dar play e parar dezenas de vezes seguidas
 * enquanto se acerta uma fase nao pode ir deixando malhas orfas na memoria.
 */
export function heroObject(): THREE.Object3D {
  if (heroCache) return heroCache;
  const corpo = new THREE.Group();
  const capsula = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.1, 4, 12),
    new THREE.MeshLambertMaterial({ color: 0x4f7cff }),
  );
  capsula.position.y = 1.1;
  corpo.add(capsula);
  const bico = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.6, 10),
    new THREE.MeshLambertMaterial({ color: 0xffd166 }),
  );
  bico.rotation.x = Math.PI / 2;
  bico.position.set(0, 1.2, 0.62);
  corpo.add(bico);
  heroCache = corpo;
  return corpo;
}
