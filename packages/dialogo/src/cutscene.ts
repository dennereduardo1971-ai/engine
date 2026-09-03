/**
 * A cutscene — a outra metade da secao 10 do plano: "timeline de câmera,
 * falas e ações".
 *
 * A conversa e dirigida pelo jogador; a cutscene e dirigida pelo relogio. Por
 * isso ela nao e uma segunda maquina de estados, e sim uma **linha do tempo**:
 * uma lista de marcas com "quando comeca" e "quanto dura", e um cursor que
 * anda com o `dt` do laço.
 *
 * Este arquivo tambem nao mexe em camera nem em peca nenhuma. Ele diz *o que
 * esta acontecendo agora e com que progresso*, e quem aplica isso na cena e o
 * runtime. E o que deixa a cutscene inteira testavel sem laço de jogo — da
 * para rodar uma cena de trinta segundos em oito `avancar()` de teste.
 */

export const CUTSCENE_VERSION = '1';

/**
 * Uma acao da linha do tempo. O `alvo` e o nome da peca (ou da camera) na
 * cena: a cutscene guarda **nome**, e nao referencia, para o arquivo
 * sobreviver a peca ser recriada.
 */
export type Acao =
  | { kind: 'falar'; quem: string; texto: string }
  | { kind: 'camera'; alvo: string }
  | { kind: 'mover'; alvo: string; para: readonly [number, number, number] }
  | { kind: 'esperar' }
  | { kind: 'fazer'; evento: string };

export interface Marca {
  readonly id: string;
  /** Segundo em que ela comeca. */
  em: number;
  /** Quanto ela dura, em segundos. Zero e um instante. */
  duracao: number;
  acao: Acao;
}

export interface CutsceneData {
  format: string;
  name: string;
  marcas: Marca[];
}

/** Uma marca acontecendo agora, com o quanto dela ja passou (0 a 1). */
export interface Ativa {
  marca: Marca;
  progresso: number;
}

export type Acontecimento =
  | { kind: 'comecou'; marca: Marca }
  | { kind: 'terminou'; marca: Marca };

/** Ordena por tempo; empate mantem a ordem em que foi escrito. */
function emOrdem(marcas: readonly Marca[]): Marca[] {
  return marcas
    .map((marca, indice) => ({ marca, indice }))
    .sort((a, b) => a.marca.em - b.marca.em || a.indice - b.indice)
    .map((item) => item.marca);
}

export function duracaoDe(marcas: readonly Marca[]): number {
  let fim = 0;
  for (const marca of marcas) fim = Math.max(fim, marca.em + Math.max(0, marca.duracao));
  return fim;
}

export class Rodando {
  private readonly marcas: Marca[];
  private readonly ligadas = new Set<string>();
  private readonly encerradas = new Set<string>();
  private t = 0;

  readonly duracao: number;

  constructor(data: CutsceneData) {
    this.marcas = emOrdem(data.marcas);
    this.duracao = duracaoDe(this.marcas);
  }

  get tempo(): number {
    return this.t;
  }

  get terminou(): boolean {
    return this.t >= this.duracao;
  }

  /**
   * Anda o relogio e devolve o que comecou e o que terminou nesse pedaco, na
   * ordem. Um `dt` grande nao pula nada: uma marca inteira que caiu dentro do
   * salto sai como "comecou" e "terminou" na mesma chamada. E o que faz uma
   * cutscene sobreviver a um travamento de meio segundo sem perder uma fala.
   */
  avancar(dt: number): Acontecimento[] {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    return this.irPara(this.t + dt);
  }

  /** Leva o relogio direto para um instante. Nunca anda para tras. */
  irPara(tempo: number): Acontecimento[] {
    if (!Number.isFinite(tempo) || tempo <= this.t) return [];
    this.t = Math.min(tempo, this.duracao);

    const saida: Acontecimento[] = [];
    for (const marca of this.marcas) {
      const fim = marca.em + Math.max(0, marca.duracao);
      if (this.t >= marca.em && !this.ligadas.has(marca.id)) {
        this.ligadas.add(marca.id);
        saida.push({ kind: 'comecou', marca });
      }
      if (this.t >= fim && this.ligadas.has(marca.id) && !this.encerradas.has(marca.id)) {
        this.encerradas.add(marca.id);
        saida.push({ kind: 'terminou', marca });
      }
    }
    return saida;
  }

  /**
   * Pular a cena. Ela nao some: o relogio vai ao fim e tudo que faltava sai
   * como acontecimento, para o estado final da cena ficar igual ao de quem
   * assistiu tudo. Pular uma cutscene nao pode deixar a porta trancada.
   */
  pular(): Acontecimento[] {
    return this.irPara(this.duracao);
  }

  get ativas(): Ativa[] {
    const saida: Ativa[] = [];
    for (const marca of this.marcas) {
      if (!this.ligadas.has(marca.id) || this.encerradas.has(marca.id)) continue;
      const duracao = Math.max(0, marca.duracao);
      saida.push({ marca, progresso: duracao === 0 ? 1 : (this.t - marca.em) / duracao });
    }
    return saida;
  }

  /** A fala que esta na tela agora, se houver. */
  get fala(): { quem: string; texto: string } | null {
    for (const ativa of this.ativas) {
      if (ativa.marca.acao.kind === 'falar') {
        return { quem: ativa.marca.acao.quem, texto: ativa.marca.acao.texto };
      }
    }
    return null;
  }

  reiniciar(): void {
    this.t = 0;
    this.ligadas.clear();
    this.encerradas.clear();
  }
}
