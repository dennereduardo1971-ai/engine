import * as THREE from 'three';
import { Engine, PerfHud, Transform, defineSystem } from '@faisca/runtime';
import {
  followCameraSystem,
  groundSpeed,
  SpeedCharacter,
  speedCharacterSystem,
} from '@faisca/kit-velocidade';
import {
  faseDeExemplo,
  findPiece,
  History,
  localFromWorld,
  readScene,
  SceneAssembler,
  SceneDocument,
  type SceneNode,
  worldPlacement,
  writeScene,
} from '@faisca/autoria';
import { Viewport } from './viewport.ts';

/**
 * O editor v0 — a fatia M3 do plano.
 *
 * Ele amarra tres coisas que ja existiam separadas: o documento de cena (que
 * sabe o que a fase e), o montador (que sabe transformar isso em mundo vivo) e
 * a engine (que sabe rodar). O que ele acrescenta e o que so o editor tem:
 * selecao, pincel de pecas, encaixe na grade, desfazer, salvar, e o botao de
 * jogar que testa a fase sem sair da tela.
 *
 * A interface em React fica por fora e so conversa com esta classe. E de
 * proposito: a decisao de interface do plano e React, mas o miolo do editor
 * nao pode depender dela — e ele que um dia responde tambem a um perfil
 * Crianca, a um script, ou ao assistente de IA.
 */
export type EditorMode = 'editar' | 'jogar';

const CHAVE_LOCAL = 'faisca:fase-01.cena';

export class Editor {
  readonly engine: Engine;
  readonly document = new SceneDocument();
  readonly assembler: SceneAssembler;
  readonly history: History;
  readonly viewport: Viewport;
  readonly hud: PerfHud;

  selection: string | null = null;
  /** Peca escolhida no painel: com ela na mao, clicar no chao coloca uma. */
  brush: string | null = null;
  grid = 2;
  snap = true;
  /** Altura em que as pecas novas caem. */
  workHeight = 0;
  mode: EditorMode = 'editar';
  /** Uma linha de recado na barra: salvo, carregado, deu erro. */
  message: string | null = null;

  private readonly listeners = new Set<() => void>();
  private salvarPendente: ReturnType<typeof setTimeout> | null = null;
  private avisoPendente = 0;

  constructor(canvas: HTMLCanvasElement, palco: HTMLElement) {
    this.engine = new Engine({ canvas, clearColor: 0x0e1117 });
    this.engine.scene.fog = new THREE.Fog(0x0e1117, 90, 320);
    this.engine.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x1a1f2b, 1.7));
    const sol = new THREE.DirectionalLight(0xfff2d5, 1.4);
    sol.position.set(30, 50, 20);
    this.engine.scene.add(sol);

    this.assembler = new SceneAssembler(this.engine, this.document);
    this.history = new History(this.document);
    // O viewport pergunta o pincel e a altura a cada clique. Sao leituras, e
    // nao copias: duas copias do mesmo estado sempre acabam discordando.
    const editor = this;
    this.viewport = new Viewport(this.engine, this.document, this.assembler, {
      get brush() {
        return editor.brush;
      },
      get workHeight() {
        return editor.workHeight;
      },
      select: (id) => this.select(id),
      place: (x, y, z) => this.placePiece(x, y, z),
      moveSelection: (x, z, fase) => this.dragSelection(x, z, fase),
    });

    // Os sistemas do jogo ficam registrados o tempo todo. Fora do teste nao
    // existe personagem nenhum, entao eles nao custam nada — e isso poupa
    // montar e desmontar o agendador a cada play.
    const physics = this.engine.physics;
    if (!physics) throw new Error('Faísca: o editor precisa da física ligada.');
    this.engine.add(
      speedCharacterSystem({ camera: this.engine.camera, input: this.engine.input, physics }),
    );
    this.engine.add(
      followCameraSystem({ camera: this.engine.camera, input: this.engine.input, physics }),
    );
    this.engine.add(
      defineSystem({
        name: 'ViewportDoEditor',
        phase: 'render',
        order: -1000,
        update: () => this.viewport.update(),
      }),
    );

    this.hud = new PerfHud(this.engine, palco);
    this.engine.add(this.hud.system());

    this.document.on(() => {
      this.agendarSalvar();
      this.notify();
    });

    this.abrirSalvo();
    this.assembler.build();
    this.engine.start();
  }

  // --- Estado para a interface ----------------------------------------------

  on(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get selectedNode(): SceneNode | null {
    return this.document.get(this.selection);
  }

  get paused(): boolean {
    return this.engine.loop.paused;
  }

  // --- Selecao e pincel -----------------------------------------------------

  select(id: string | null): void {
    this.selection = id;
    this.viewport.selecionadoAtual = id;
    this.viewport.showSelection(this.document.get(id));
    this.notify();
  }

  setBrush(piece: string | null): void {
    this.brush = this.brush === piece ? null : piece;
    this.notify();
  }

  setWorkHeight(value: number): void {
    this.workHeight = value;
    this.notify();
  }

  setGrid(value: number): void {
    this.grid = value;
    this.notify();
  }

  toggleSnap(): void {
    this.snap = !this.snap;
    this.notify();
  }

  // --- Editar a cena --------------------------------------------------------

  /** Coloca no mundo a peca que esta na mao. */
  placePiece(x: number, y: number, z: number): void {
    const brush = this.brush;
    if (!brush) return;
    const piece = findPiece(brush);
    if (!piece) return;

    if (piece.unique && this.document.firstOfPiece(brush)) {
      this.aviso(`Só pode haver um ${piece.label} na fase.`);
      return;
    }

    this.history.record(`colocar ${piece.label}`);
    const pai = this.grupoPara(piece.group);
    const local = localFromWorld(
      this.document,
      pai,
      this.encaixar(x),
      y + piece.dropY,
      this.encaixar(z),
    );
    const no = this.document.add(brush, {
      name: this.nomeLivre(piece.label),
      parent: pai,
      transform: { ...local },
    });
    this.select(no.id);
  }

  /** Arrasto no viewport: um passo de desfazer para o arrasto inteiro. */
  dragSelection(x: number, z: number, fase: 'inicio' | 'meio' | 'fim'): void {
    const node = this.selectedNode;
    if (!node) return;
    if (fase === 'inicio') {
      this.history.record('mover', `mover:${node.id}`);
      return;
    }
    if (fase === 'fim') {
      this.history.breakGroup();
      return;
    }
    const mundo = worldPlacement(this.document, node);
    const local = localFromWorld(
      this.document,
      node.parent,
      this.encaixar(x),
      mundo.y,
      this.encaixar(z),
    );
    this.document.setTransform(node.id, { x: local.x, z: local.z });
    this.viewport.showSelection(node);
  }

  setTransform(patch: Record<string, number>, agrupar?: string): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record('ajustar', agrupar);
    this.document.setTransform(node.id, patch);
    this.viewport.showSelection(node);
  }

  setField(component: string, field: string, value: number): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record('ajustar valor', `campo:${node.id}:${component}:${field}`);
    this.document.setField(node.id, component, field, value);
  }

  rename(name: string): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record('renomear', `nome:${node.id}`);
    this.document.rename(node.id, name);
  }

  setColor(color: number | null): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record('trocar a cor', `cor:${node.id}`);
    this.document.setColor(node.id, color);
    this.viewport.showSelection(this.selectedNode);
  }

  setVisible(visible: boolean): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record(visible ? 'mostrar' : 'esconder');
    this.document.setVisible(node.id, visible);
  }

  setParent(parent: string | null): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record('mudar de pai');
    if (!this.document.setParent(node.id, parent)) {
      this.aviso('Uma peça não pode ficar dentro de si mesma.');
      return;
    }
    this.viewport.showSelection(this.selectedNode);
  }

  rotateSelection(graus: number): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record('girar');
    this.document.setTransform(node.id, { yaw: node.transform.yaw + graus });
    this.viewport.showSelection(node);
  }

  /** Sobe ou desce a peca sem sair do lugar no plano. */
  nudgeHeight(delta: number): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record('mudar a altura', `altura:${node.id}`);
    this.document.setTransform(node.id, { y: node.transform.y + delta });
    this.viewport.showSelection(node);
  }

  deleteSelection(): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record(`apagar ${node.name}`);
    this.document.remove(node.id);
    this.select(null);
  }

  duplicateSelection(): void {
    const node = this.selectedNode;
    if (!node) return;
    this.history.record(`duplicar ${node.name}`);
    const copia = this.document.duplicate(node.id, { x: this.grid || 2, y: 0, z: 0 });
    if (copia) this.select(copia.id);
  }

  undo(): void {
    if (this.history.undo()) {
      this.select(this.document.get(this.selection) ? this.selection : null);
      this.aviso('Desfeito.');
    }
  }

  redo(): void {
    if (this.history.redo()) {
      this.select(this.document.get(this.selection) ? this.selection : null);
      this.aviso('Refeito.');
    }
  }

  // --- Teste ao vivo --------------------------------------------------------

  play(): void {
    if (this.mode === 'jogar') return;
    if (!this.document.firstOfPiece('inicio')) {
      this.aviso('A fase não tem Ponto de Partida. Coloque um para poder jogar.');
      return;
    }
    this.mode = 'jogar';
    this.select(null);
    this.viewport.saveCamera();
    this.viewport.setEditing(false);
    this.engine.loop.paused = false;
    this.assembler.startPlay();
    this.notify();
  }

  stop(): void {
    if (this.mode === 'editar') return;
    this.assembler.stopPlay();
    this.engine.loop.paused = false;
    this.mode = 'editar';
    this.viewport.setEditing(true);
    this.viewport.restoreCamera();
    if (window.document.pointerLockElement) window.document.exitPointerLock();
    this.notify();
  }

  togglePause(): void {
    this.engine.loop.paused = !this.engine.loop.paused;
    this.notify();
  }

  /** Um passo fixo de cada vez, com a simulacao parada. */
  stepOnce(): void {
    this.engine.loop.paused = true;
    this.engine.loop.stepOnce();
    this.notify();
  }

  /**
   * Retrato do personagem do teste: onde ele esta e a que velocidade.
   *
   * E o que o console ao vivo da secao 7 do plano vai perguntar primeiro, e e
   * o jeito de conferir de fora que um deslizador mexido no inspetor chegou
   * mesmo no personagem que ja esta correndo.
   */
  heroSnapshot(): { x: number; y: number; z: number; speed: number; maxSpeed: number } | null {
    const heroi = this.assembler.hero;
    if (heroi < 0) return null;
    const ts = Transform.slotOf(heroi);
    const cs = SpeedCharacter.slotOf(heroi);
    if (ts < 0 || cs < 0) return null;
    const t = Transform.fields;
    return {
      x: t.x[ts],
      y: t.y[ts],
      z: t.z[ts],
      speed: groundSpeed(cs),
      maxSpeed: SpeedCharacter.fields.maxSpeed[cs],
    };
  }

  // --- Arquivo --------------------------------------------------------------

  novaFase(): void {
    this.history.record('nova fase');
    this.document.load({ format: '0.1', name: 'Fase nova', nodes: [] });
    this.select(null);
    this.aviso('Fase nova. A anterior ainda dá para trazer de volta com Desfazer.');
  }

  carregarExemplo(): void {
    this.history.record('abrir a fase de exemplo');
    this.document.load(faseDeExemplo());
    this.select(null);
    this.aviso('Fase de exemplo aberta.');
  }

  renomearCena(name: string): void {
    this.document.name = name;
    this.agendarSalvar();
    this.notify();
  }

  /** O texto do arquivo `.cena`, do jeito que ele vai para o disco. */
  texto(): string {
    return writeScene(this.document.toJSON());
  }

  /** Baixa a fase como arquivo de texto. */
  exportar(): void {
    const blob = new Blob([this.texto()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${slug(this.document.name)}.cena`;
    link.click();
    URL.revokeObjectURL(url);
    this.aviso('Fase baixada.');
  }

  importar(texto: string): void {
    try {
      const dados = readScene(texto);
      this.history.record('abrir um arquivo');
      this.document.load(dados);
      this.select(null);
      this.aviso(`"${dados.name}" carregada.`);
    } catch (erro) {
      this.aviso(erro instanceof Error ? erro.message : 'Não consegui ler este arquivo.');
    }
  }

  dispose(): void {
    if (this.salvarPendente) clearTimeout(this.salvarPendente);
    this.salvarPendente = null;
    this.viewport.dispose();
    this.assembler.dispose();
    this.hud.dispose();
    this.engine.dispose();
  }

  // --- Miudezas -------------------------------------------------------------

  private encaixar(valor: number): number {
    if (!this.snap || this.grid <= 0) return Math.round(valor * 100) / 100;
    return Math.round(valor / this.grid) * this.grid;
  }

  /**
   * Pecas novas caem dentro do grupo do tipo delas, quando ele existe. E o que
   * mantem a arvore parecida com a do plano (Pista, Anéis, Cenário) sem
   * obrigar ninguem a arrastar nada.
   */
  private grupoPara(grupo: string): string | null {
    const nomes: Record<string, string> = {
      pista: 'Pista',
      coletavel: 'Anéis',
      cenario: 'Cenário',
    };
    const alvo = nomes[grupo];
    if (!alvo) return null;
    for (const node of this.document.nodes) {
      if (node.piece === 'grupo' && node.name === alvo) return node.id;
    }
    return null;
  }

  /** "Reta", "Reta 2", "Reta 3": nome novo sem repetir o que ja tem. */
  private nomeLivre(base: string): string {
    const usados = new Set(this.document.nodes.map((node) => node.name));
    if (!usados.has(base)) return base;
    for (let i = 2; i < 10_000; i++) {
      const nome = `${base} ${i}`;
      if (!usados.has(nome)) return nome;
    }
    return base;
  }

  private abrirSalvo(): void {
    let texto: string | null = null;
    try {
      texto = localStorage.getItem(CHAVE_LOCAL);
    } catch {
      // Navegador com armazenamento bloqueado: segue com a fase de exemplo.
      texto = null;
    }
    if (!texto) {
      this.document.load(faseDeExemplo());
      return;
    }
    try {
      this.document.load(readScene(texto));
    } catch {
      this.document.load(faseDeExemplo());
      this.aviso('O rascunho salvo estava quebrado; abri a fase de exemplo.');
    }
  }

  /**
   * Salvar sozinho, um pouco depois da ultima mudanca.
   *
   * Offline-first e decisao de plano (secao 2): a fase mora na maquina e nao
   * depende de nuvem nenhuma. Escrever a cada tecla digitada seria caro; meio
   * segundo depois da ultima e barato e nao perde nada.
   */
  private agendarSalvar(): void {
    if (this.salvarPendente) clearTimeout(this.salvarPendente);
    this.salvarPendente = setTimeout(() => {
      this.salvarPendente = null;
      try {
        localStorage.setItem(CHAVE_LOCAL, this.texto());
      } catch {
        this.aviso('Não consegui salvar na máquina. Baixe a fase para não perder.');
      }
    }, 500);
  }

  private aviso(texto: string): void {
    this.message = texto;
    const meu = ++this.avisoPendente;
    this.notify();
    setTimeout(() => {
      if (this.avisoPendente !== meu) return;
      this.message = null;
      this.notify();
    }, 5_000);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function slug(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return limpo || 'fase';
}
