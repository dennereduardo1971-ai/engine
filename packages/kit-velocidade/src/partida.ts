/**
 * A partida — o estado de quem esta jogando agora.
 *
 * Aneis, vidas, tempo e como a fase terminou. E um objeto simples, e nao um
 * componente do ECS, porque ele nao e "de uma entidade": e da sessao de jogo.
 * O HUD le daqui, os brinquedos de pista escrevem aqui, e o save guarda um
 * resumo disto no fim.
 */

export type EstadoDaPartida = 'jogando' | 'perdeu' | 'venceu';

/** Quanto tempo o personagem fica piscando e imune depois de levar dano. */
const INVULNERAVEL = 1.5;

export interface ResumoDaPartida {
  aneis: number;
  tempo: number;
  vidas: number;
}

export class Partida {
  /** Aneis coletados desde o comeco da fase. */
  aneis = 0;
  vidas = 3;
  /** Tempo de jogo em segundos. Para de correr quando a fase termina. */
  tempo = 0;
  estado: EstadoDaPartida = 'jogando';
  /** Tempo restante de imunidade depois de levar dano. */
  invulneravel = 0;
  /** Quantas vezes o personagem levou dano ou caiu. */
  quedas = 0;

  constructor(readonly vidasIniciais = 3) {
    this.vidas = vidasIniciais;
  }

  get jogando(): boolean {
    return this.estado === 'jogando';
  }

  /** Anda o relogio. Chamado uma vez por passo fixo. */
  avancar(dt: number): void {
    if (this.estado !== 'jogando') return;
    this.tempo += dt;
    if (this.invulneravel > 0) this.invulneravel = Math.max(0, this.invulneravel - dt);
  }

  coletar(quantos = 1): void {
    if (this.estado !== 'jogando') return;
    this.aneis += quantos;
  }

  /**
   * Levar dano custa os aneis, e nao a vida — enquanto houver anel.
   *
   * E a regra que faz o anel valer alguma coisa sem punir o jogador
   * iniciante: quem tem anel erra e continua; quem esta sem anel e que
   * precisa tomar cuidado. Devolve `true` se custou uma vida.
   */
  levarDano(): boolean {
    if (this.estado !== 'jogando' || this.invulneravel > 0) return false;
    this.quedas++;
    this.invulneravel = INVULNERAVEL;
    if (this.aneis > 0) {
      this.aneis = 0;
      return false;
    }
    return this.perderVida();
  }

  /** Cair no buraco custa uma vida direto, com anel ou sem. */
  perderVida(): boolean {
    if (this.estado !== 'jogando') return false;
    this.vidas--;
    this.aneis = 0;
    this.invulneravel = INVULNERAVEL;
    if (this.vidas <= 0) {
      this.vidas = 0;
      this.estado = 'perdeu';
    }
    return true;
  }

  vencer(): void {
    if (this.estado !== 'jogando') return;
    this.estado = 'venceu';
  }

  resumo(): ResumoDaPartida {
    return { aneis: this.aneis, tempo: this.tempo, vidas: this.vidas };
  }

  reiniciar(): void {
    this.aneis = 0;
    this.vidas = this.vidasIniciais;
    this.tempo = 0;
    this.estado = 'jogando';
    this.invulneravel = 0;
    this.quedas = 0;
  }
}

/** O que o save guarda de uma fase. */
export interface ProgressoDaFase {
  concluida: boolean;
  /** Menor tempo, em segundos. */
  melhorTempo: number | null;
  maisAneis: number;
  vezesJogada: number;
}

export const PROGRESSO_VAZIO: ProgressoDaFase = {
  concluida: false,
  melhorTempo: null,
  maisAneis: 0,
  vezesJogada: 0,
};

/**
 * Junta o resultado de uma partida ao progresso guardado.
 *
 * So melhora: uma partida ruim nunca apaga um recorde bom. Quem joga de novo
 * e faz pior continua com o recorde anterior — e o contrario seria uma punicao
 * silenciosa por jogar mais.
 */
export function somarProgresso(
  anterior: ProgressoDaFase,
  partida: Partida,
): ProgressoDaFase {
  const venceu = partida.estado === 'venceu';
  return {
    concluida: anterior.concluida || venceu,
    melhorTempo: venceu
      ? anterior.melhorTempo === null
        ? partida.tempo
        : Math.min(anterior.melhorTempo, partida.tempo)
      : anterior.melhorTempo,
    maisAneis: Math.max(anterior.maisAneis, partida.aneis),
    vezesJogada: anterior.vezesJogada + 1,
  };
}
