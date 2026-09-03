/**
 * A conversa rodando — um passo de cada vez.
 *
 * Isto e uma maquina de estados sobre o documento, e nao um sistema do
 * runtime: ela nao tem `update(dt)`, nao desenha balao e nao toca som. Quem
 * decide quando avancar e quem clicou, o botao do HUD ou uma cutscene. E o
 * que deixa a conversa inteira testavel sem laço de jogo e sem DOM.
 *
 * A maquina nunca muda o documento: escolher uma opcao anda o cursor, e nao
 * reescreve a fala. Assim a mesma conversa roda duas vezes seguidas, ou em
 * dois personagens ao mesmo tempo, sem uma sujar a outra.
 */

import type { ConversaData, Passo } from './documento.ts';

/** O que aparece na tela agora. */
export interface Balao {
  /** Id do passo, para quem quiser marcar o que ja foi visto. */
  id: string;
  quem: string;
  texto: string;
  /** Vazio: e uma fala simples, e `avancar()` continua. */
  opcoes: readonly string[];
}

export class Conversando {
  private readonly porId = new Map<string, Passo>();
  private readonly primeiro: string | null;
  private atualId: string | null = null;
  private readonly vistos: string[] = [];

  /**
   * @param inicio Passo por onde comecar. Vazio comeca pelo primeiro da
   * lista — a ordem do arquivo e a ordem da conversa.
   */
  constructor(data: ConversaData, inicio?: string | null) {
    for (const passo of data.passos) this.porId.set(passo.id, passo);
    const pedido = inicio && this.porId.has(inicio) ? inicio : null;
    this.primeiro = pedido ?? data.passos[0]?.id ?? null;
    this.ir(this.primeiro);
  }

  private ir(id: string | null): void {
    this.atualId = id && this.porId.has(id) ? id : null;
    if (this.atualId) this.vistos.push(this.atualId);
  }

  get atual(): Passo | null {
    return this.atualId ? this.porId.get(this.atualId) ?? null : null;
  }

  get terminou(): boolean {
    return this.atualId === null;
  }

  /** Por onde a conversa ja passou, na ordem. Repete se ela voltar. */
  get visitados(): readonly string[] {
    return this.vistos;
  }

  get balao(): Balao | null {
    const passo = this.atual;
    if (!passo) return null;
    return {
      id: passo.id,
      quem: passo.quem,
      texto: passo.texto,
      opcoes: passo.opcoes.map((opcao) => opcao.texto),
    };
  }

  /**
   * Continua uma fala simples. Numa pergunta ele nao faz nada e devolve
   * `false`: quem tem escolha na tela precisa escolher, e avancar sozinho
   * comeria a resposta do jogador.
   */
  avancar(): boolean {
    const passo = this.atual;
    if (!passo || passo.opcoes.length > 0) return false;
    this.ir(passo.proxima);
    return true;
  }

  escolher(indice: number): boolean {
    const passo = this.atual;
    const opcao = passo?.opcoes[indice];
    if (!passo || !opcao) return false;
    this.ir(opcao.destino);
    return true;
  }

  reiniciar(): void {
    this.vistos.length = 0;
    this.ir(this.primeiro);
  }
}
