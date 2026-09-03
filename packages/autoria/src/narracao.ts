/**
 * A narracao por voz do Modo Crianca — a M12, secao 13 do plano ("narração por
 * voz dos menus").
 *
 * Este arquivo nao fala: ele decide **o que** deve ser dito e **quando calar**.
 * Quem tem voz de verdade e o navegador (`speechSynthesis`), e ele fica no
 * editor, atras da interface `Voz` — mesma divisao que o resto do repositorio
 * faz entre a conta e o desenho. Em troca, a regra que mais importa aqui, a de
 * nao empilhar fala, e testavel sem janela e sem som.
 */

/** Quem sabe falar de verdade. O editor liga uma; o teste liga uma de mentira. */
export interface Voz {
  falar(texto: string): void;
  /** Cala na hora, jogando fora o que ainda nao foi dito. */
  calar(): void;
}

export interface NarradorOptions {
  /** Comeca falando? O perfil decide; o padrao e nao. */
  ligado?: boolean;
}

/**
 * O narrador.
 *
 * Duas regras, e as duas existem porque uma crianca passa o dedo por cinco
 * botoes em dois segundos:
 *
 * 1. **Fala nova cala a anterior.** Narracao de menu e sempre "o que eu estou
 *    olhando agora". Uma fila faria o quinto botao ser lido dez segundos
 *    depois de o dedo ter saido dele.
 * 2. **Nao repete o que acabou de dizer.** Voltar o foco para o mesmo botao,
 *    ou um redesenho do React, nao pode fazer o computador repetir a frase.
 *    Quem precisa repetir de proposito pede (`falar(texto, true)`).
 */
export class Narrador {
  ligado: boolean;
  private voz: Voz | null = null;
  private ultimo = '';

  constructor(options: NarradorOptions = {}) {
    this.ligado = options.ligado ?? false;
  }

  /** Liga (ou troca) a voz. `null` desliga o som sem apagar o estado. */
  usarVoz(voz: Voz | null): void {
    if (this.voz && this.voz !== voz) this.voz.calar();
    this.voz = voz;
    this.ultimo = '';
  }

  get temVoz(): boolean {
    return this.voz !== null;
  }

  /** O que foi dito por ultimo. Vazio depois de calar. */
  get dito(): string {
    return this.ultimo;
  }

  /** Devolve se realmente falou — o teste (e o editor) precisam saber. */
  falar(texto: string, repetir = false): boolean {
    const limpo = texto.trim().replace(/\s+/g, ' ');
    if (!this.ligado || !this.voz || limpo.length === 0) return false;
    if (!repetir && limpo === this.ultimo) return false;
    this.voz.calar();
    this.voz.falar(limpo);
    this.ultimo = limpo;
    return true;
  }

  /** Cala na hora e esquece: a proxima fala igual volta a ser dita. */
  calar(): void {
    this.ultimo = '';
    this.voz?.calar();
  }

  /** Liga ou desliga. Desligar cala o que estava no ar. */
  setLigado(ligado: boolean): void {
    if (this.ligado === ligado) return;
    this.ligado = ligado;
    if (!ligado) this.calar();
  }
}

/**
 * O texto que um controle deve narrar.
 *
 * A ordem importa: o rotulo visivel primeiro, porque e o que a crianca esta
 * vendo; a ajuda depois, porque e o que ela ainda nao sabe. Um controle sem
 * rotulo nenhum nao vira silencio — vira o `title`, que e melhor que nada.
 */
export function narracaoDoControle(rotulo: string, ajuda = ''): string {
  const partes = [rotulo.trim(), ajuda.trim()].filter((parte) => parte.length > 0);
  const visto = new Set<string>();
  return partes.filter((parte) => !visto.has(parte) && visto.add(parte)).join('. ');
}
