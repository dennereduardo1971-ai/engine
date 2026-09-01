import { defineComponent, defineSystem, type Entity, type System, Transform, view } from '@faisca/runtime';

/**
 * A porta — o primeiro brinquedo do kit Fisica-brinquedo (secao 10 do plano).
 *
 * Ela existe porque a regra-modelo da secao 7 e *"quando o jogador entra aqui
 * → **abre a porta** e toca som"*. Sem uma porta de verdade, essa frase seria
 * so um exemplo de documentacao; com ela, e a primeira coisa que a familia
 * monta apontando e clicando.
 *
 * A porta desce para abrir, em vez de girar. Girar exigiria dobradica, eixo e
 * um colisor que acompanha o giro — trabalho de fisica de corpo movel, que a
 * pista de malha estatica da M2 nao faz. Descer e um deslizamento em linha
 * reta, le como porta de castelo, e cabe no que a engine ja sabe fazer hoje.
 */
const CAMPOS = {
  /** Quanto ela desce ao abrir. */
  travel: 'f32',
  /** Velocidade do movimento, em unidades por segundo. */
  speed: 'f32',

  // Estado.
  /** Para onde ela esta indo: 1 aberta, 0 fechada. */
  alvo: 'u8',
  /** Quanto ela ja desceu, de 0 a `travel`. */
  andado: 'f32',
  /** Altura em que ela foi colocada, guardada no primeiro passo. */
  baseY: 'f32',
  started: 'u8',
} as const;

export const Porta = defineComponent('Porta', 'Porta', CAMPOS, {
  travel: 4.5,
  speed: 9,
});

/**
 * Manda a porta abrir ou fechar. Nao move nada agora: quem move e o sistema,
 * no proximo passo, e e por isso que ela desliza em vez de piscar.
 */
export function mandarPorta(entity: Entity, abrir: boolean): boolean {
  const slot = Porta.slotOf(entity);
  if (slot < 0) return false;
  Porta.fields.alvo[slot] = abrir ? 1 : 0;
  return true;
}

/** A porta ja terminou de abrir? */
export function portaAberta(entity: Entity): boolean {
  const slot = Porta.slotOf(entity);
  if (slot < 0) return false;
  return Porta.fields.andado[slot] >= Porta.fields.travel[slot];
}

export function portaSystem(): System {
  const portas = view(Transform, Porta);

  return defineSystem({
    name: 'Porta',
    phase: 'logic',
    // Depois dos scripts (120): a porta que um script acabou de mandar abrir
    // ja anda no mesmo passo, e nao um passo depois.
    order: 130,
    update({ dt }) {
      const t = Transform.fields;
      const p = Porta.fields;

      portas.each((_porta, ts, ps) => {
        // A altura de origem e guardada no primeiro passo, e nao lida a cada
        // quadro: a partir daqui a porta se move, e ler a altura de novo
        // faria ela descer para sempre.
        if (p.started[ps] === 0) {
          p.baseY[ps] = t.y[ts];
          p.started[ps] = 1;
        }

        const destino = p.alvo[ps] === 1 ? p.travel[ps] : 0;
        const passo = p.speed[ps] * dt;
        const andado = p.andado[ps];

        if (andado < destino) p.andado[ps] = Math.min(destino, andado + passo);
        else if (andado > destino) p.andado[ps] = Math.max(destino, andado - passo);
        else return;

        t.y[ts] = p.baseY[ps] - p.andado[ps];
      });
    },
  });
}

/**
 * Devolve as portas ao estado de antes da partida.
 *
 * Sem isto, testar a fase a consumiria: a segunda vez que a mae apertasse
 * Jogar, a porta que ela abriu na primeira ja estaria aberta — e ela nao teria
 * como saber por que a regra dela "parou de funcionar".
 */
export function resetPortas(): void {
  const p = Porta.fields;
  for (let slot = 0; slot < Porta.count; slot++) {
    p.alvo[slot] = 0;
    p.andado[slot] = 0;
    p.started[slot] = 0;
  }
}
