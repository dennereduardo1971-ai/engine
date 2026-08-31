import * as THREE from 'three';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  /**
   * Teto do pixel ratio. Numa tela de notebook com escala 1,5 e grafico Intel
   * integrado, respeitar o devicePixelRatio inteiro custa mais que dobro de
   * pixels por nada visivel.
   */
  maxPixelRatio?: number;
  clearColor?: number;
}

export interface GraphicsReport {
  backend: 'webgl2' | 'webgl';
  webgpuAvailable: boolean;
  gpu: string;
  maxTextureSize: number;
}

/**
 * Fina camada em cima do WebGLRenderer do Three.js: tamanho, escala de
 * renderizacao e o relatorio de o que esta maquina consegue.
 *
 * WebGL2 e o padrao de proposito. WebGPU e detectado e reportado, mas so vira
 * padrao quando for confiavel no hardware da casa (secao 2 do plano).
 */
export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;

  private scaleValue = 1;
  private readonly maxPixelRatio: number;
  private width = 1;
  private height = 1;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.maxPixelRatio = options.maxPixelRatio ?? 1.5;
    this.three = new THREE.WebGLRenderer({
      canvas: options.canvas,
      // Antialias custa caro num chip integrado e a escala dinamica ja
      // desmancharia o ganho. Fica desligado; suavizacao entra depois, no
      // pos-processamento, que e a primeira coisa a cair quando aperta.
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    this.three.setClearColor(options.clearColor ?? 0x10131a, 1);
    this.three.shadowMap.enabled = false;
    this.resize();
  }

  /** Escala de renderizacao, de 0,5 a 1. Abaixo de 1 desenha menos pixels. */
  get renderScale(): number {
    return this.scaleValue;
  }

  set renderScale(value: number) {
    const clamped = Math.min(1, Math.max(0.5, value));
    if (Math.abs(clamped - this.scaleValue) < 0.001) return;
    this.scaleValue = clamped;
    this.applySize();
  }

  /** Le o tamanho do canvas na pagina e reajusta o buffer. */
  resize(): boolean {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    if (width === this.width && height === this.height) return false;
    this.width = width;
    this.height = height;
    this.applySize();
    return true;
  }

  get aspect(): number {
    return this.height === 0 ? 1 : this.width / this.height;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.three.render(scene, camera);
  }

  /** Chamadas de desenho e triangulos do ultimo quadro. */
  stats(): { drawCalls: number; triangles: number } {
    const info = this.three.info.render;
    return { drawCalls: info.calls, triangles: info.triangles };
  }

  report(): GraphicsReport {
    const gl = this.three.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : 'desconhecida';
    return {
      backend: this.three.capabilities.isWebGL2 ? 'webgl2' : 'webgl',
      webgpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
      gpu,
      maxTextureSize: this.three.capabilities.maxTextureSize,
    };
  }

  dispose(): void {
    this.three.dispose();
  }

  private applySize(): void {
    const pixelRatio = Math.min(
      typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
      this.maxPixelRatio,
    );
    this.three.setPixelRatio(pixelRatio * this.scaleValue);
    // `false` = nao mexe no CSS: o canvas continua do tamanho da tela e o
    // navegador estica a imagem menor, que e exatamente o efeito desejado.
    this.three.setSize(this.width, this.height, false);
  }
}
