import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Engine } from '@faisca/runtime';
import {
  pieceBounds,
  pieceOrPlaceholder,
  type SceneAssembler,
  type SceneDocument,
  type SceneNode,
  worldPlacement,
} from '@faisca/autoria';

/**
 * O viewport — a janela por onde se monta a fase.
 *
 * Ele cuida do que e do editor e nao do jogo: a camera que orbita, a grade, o
 * contorno da selecao e o mouse. Nada disso vai dentro do jogo publicado, e
 * por isso nada disso mora no runtime (secao 4 do plano).
 *
 * O mouse segue a divisao que quem ja abriu um editor 3D espera:
 *
 *   botao esquerdo   selecionar, arrastar a peca, ou pintar a peca escolhida
 *   botao direito    girar a camera em volta do ponto de interesse
 *   botao do meio    arrastar a vista de lado
 *   roda             aproximar e afastar
 */
export interface ViewportActions {
  /** Peca escolhida no painel, ou null quando o pincel esta guardado. */
  readonly brush: string | null;
  /** Altura em que as pecas novas sao colocadas. */
  readonly workHeight: number;
  select(nodeId: string | null): void;
  place(x: number, y: number, z: number): void;
  /** Arrasto da selecao no plano do chao. */
  moveSelection(x: number, z: number, phase: 'inicio' | 'meio' | 'fim'): void;
}

/** Distancia em pixels antes de um clique virar arrasto. */
const LIMIAR_ARRASTO = 3;

export class Viewport {
  readonly controls: OrbitControls;
  readonly grid: THREE.GridHelper;
  readonly ground: THREE.Mesh;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ponteiro = new THREE.Vector2();
  private readonly plano = new THREE.Plane();
  private readonly ponto = new THREE.Vector3();
  private readonly contorno: THREE.LineSegments;
  private readonly listeners: [string, EventListener][] = [];
  private readonly cameraGuardada = { position: new THREE.Vector3(), target: new THREE.Vector3() };

  /** No que o arrasto esta movendo. O editor mantem em dia. */
  selecionadoAtual: string | null = null;

  private arrastando = false;
  private podeArrastar = false;
  private inicioX = 0;
  private inicioY = 0;
  private readonly offset = new THREE.Vector3();

  constructor(
    private readonly engine: Engine,
    private readonly document: SceneDocument,
    private readonly assembler: SceneAssembler,
    private readonly actions: ViewportActions,
  ) {
    const canvas = engine.renderer.canvas;

    this.controls = new OrbitControls(engine.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 220;
    // O esquerdo e do editor: selecionar, arrastar e pintar. A camera fica com
    // o direito e o do meio, senao os dois brigam pelo mesmo botao.
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.target.set(0, 0, 12);
    engine.camera.position.set(-22, 20, -14);
    this.controls.update();

    // Chao do mundo: e onde a peca cai quando se pinta no vazio, e e o piso
    // que sustenta o personagem fora das pecas.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshLambertMaterial({ color: 0x222a3d }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.name = 'chao';
    engine.scene.add(this.ground);

    this.grid = new THREE.GridHelper(600, 300, 0x5570a8, 0x36436a);
    const gridMaterial = this.grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.75;
    // Um fio acima do chao: coplanar com ele, a grade brigava pelo mesmo pixel.
    this.grid.position.y = 0.02;
    engine.scene.add(this.grid);

    this.contorno = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x4ade80, depthTest: false }),
    );
    this.contorno.renderOrder = 999;
    this.contorno.visible = false;
    this.contorno.matrixAutoUpdate = true;
    engine.scene.add(this.contorno);

    this.on(canvas, 'pointerdown', (event) => this.onPointerDown(event as PointerEvent));
    this.on(canvas, 'pointermove', (event) => this.onPointerMove(event as PointerEvent));
    this.on(canvas, 'pointerup', (event) => this.onPointerUp(event as PointerEvent));
    // Sem isso, o menu do navegador abre no meio de girar a camera.
    this.on(canvas, 'contextmenu', (event) => event.preventDefault());
  }

  /** Roda uma vez por quadro, na fase de render. */
  update(): void {
    if (this.controls.enabled) this.controls.update();
  }

  /** Editar ou jogar: no jogo, a camera e a do Kit Velocidade. */
  setEditing(editing: boolean): void {
    this.controls.enabled = editing;
    this.grid.visible = editing;
    if (!editing) this.contorno.visible = false;
  }

  /** Guarda e devolve a vista de edicao, para o teste nao perder o lugar. */
  saveCamera(): void {
    this.cameraGuardada.position.copy(this.engine.camera.position);
    this.cameraGuardada.target.copy(this.controls.target);
  }

  restoreCamera(): void {
    this.engine.camera.position.copy(this.cameraGuardada.position);
    this.controls.target.copy(this.cameraGuardada.target);
    this.engine.camera.fov = 60;
    this.engine.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Poe o contorno em volta do no selecionado. */
  showSelection(node: SceneNode | null): void {
    if (!node) {
      this.contorno.visible = false;
      return;
    }
    const piece = pieceOrPlaceholder(node.piece);
    const caixa = pieceBounds(piece);
    const tamanho = caixa.getSize(new THREE.Vector3());
    const centro = caixa.getCenter(new THREE.Vector3());
    // Grupo nao tem malha: um cubinho marca onde ele esta.
    if (tamanho.lengthSq() < 1e-6) {
      tamanho.set(1.4, 1.4, 1.4);
      centro.set(0, 0.7, 0);
    }

    const place = worldPlacement(this.document, node);
    const cos = Math.cos(place.yaw);
    const sin = Math.sin(place.yaw);
    const cx = centro.x * place.sx;
    const cz = centro.z * place.sz;
    this.contorno.position.set(
      place.x + cx * cos + cz * sin,
      place.y + centro.y * place.sy,
      place.z + -cx * sin + cz * cos,
    );
    this.contorno.rotation.set(0, place.yaw, 0);
    this.contorno.scale.set(
      Math.max(0.2, tamanho.x * place.sx),
      Math.max(0.2, tamanho.y * place.sy),
      Math.max(0.2, tamanho.z * place.sz),
    );
    this.contorno.visible = true;
  }

  dispose(): void {
    const canvas = this.engine.renderer.canvas;
    for (const [type, listener] of this.listeners) canvas.removeEventListener(type, listener);
    this.listeners.length = 0;
    this.controls.dispose();
  }

  // --- Mouse ----------------------------------------------------------------

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (!this.controls.enabled) {
      // Jogando: o clique nao seleciona nada, ele trava o ponteiro para o
      // mouse virar controle de camera em vez de cursor. Esc devolve.
      const canvas = this.engine.renderer.canvas;
      if (!document.pointerLockElement) void canvas.requestPointerLock();
      return;
    }
    this.inicioX = event.clientX;
    this.inicioY = event.clientY;

    // Com o pincel na mao, o clique e uma peca nova, e nao uma selecao.
    if (this.actions.brush) {
      const ponto = this.pontoNoPlano(event, this.actions.workHeight);
      if (ponto) this.actions.place(ponto.x, this.actions.workHeight, ponto.z);
      return;
    }

    const alvo = this.pick(event);
    this.actions.select(alvo);
    this.podeArrastar = alvo !== null;
    this.arrastando = false;

    if (alvo) {
      const node = this.document.get(alvo);
      if (node) {
        const place = worldPlacement(this.document, node);
        const ponto = this.pontoNoPlano(event, place.y);
        // Guarda onde dentro da peca o mouse pegou, para ela nao pular para
        // debaixo do cursor no primeiro pixel de arrasto.
        if (ponto) this.offset.set(ponto.x - place.x, 0, ponto.z - place.z);
        else this.offset.set(0, 0, 0);
      }
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.podeArrastar) return;
    if (!this.arrastando) {
      const andou = Math.hypot(event.clientX - this.inicioX, event.clientY - this.inicioY);
      if (andou < LIMIAR_ARRASTO) return;
      this.arrastando = true;
      this.actions.moveSelection(0, 0, 'inicio');
    }

    const node = this.document.get(this.selecionadoAtual);
    if (!node) return;
    const place = worldPlacement(this.document, node);
    const ponto = this.pontoNoPlano(event, place.y);
    if (!ponto) return;
    this.actions.moveSelection(ponto.x - this.offset.x, ponto.z - this.offset.z, 'meio');
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.arrastando) this.actions.moveSelection(0, 0, 'fim');
    this.arrastando = false;
    this.podeArrastar = false;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  private pick(event: PointerEvent): string | null {
    this.prepararRaio(event);
    const alvos = this.assembler.pickables();
    const acertos = this.raycaster.intersectObjects(alvos, false);
    for (const acerto of acertos) {
      const node = this.assembler.nodeAtHit(acerto);
      if (node) return node;
    }
    return null;
  }

  /** Onde o raio do mouse cruza o plano horizontal na altura pedida. */
  private pontoNoPlano(event: PointerEvent, altura: number): THREE.Vector3 | null {
    this.prepararRaio(event);
    this.plano.set(new THREE.Vector3(0, 1, 0), -altura);
    return this.raycaster.ray.intersectPlane(this.plano, this.ponto);
  }

  private prepararRaio(event: PointerEvent): void {
    const canvas = this.engine.renderer.canvas;
    const caixa = canvas.getBoundingClientRect();
    this.ponteiro.x = ((event.clientX - caixa.left) / caixa.width) * 2 - 1;
    this.ponteiro.y = -((event.clientY - caixa.top) / caixa.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ponteiro, this.engine.camera);
  }

  private on(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.listeners.push([type, listener]);
  }
}
