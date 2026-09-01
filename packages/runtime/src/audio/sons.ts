/**
 * Sons — o minimo de audio que faz uma regra soar como acontecimento.
 *
 * A secao 10 do plano promete um kit de audio inteiro (efeitos, musica em
 * camadas, audio espacial, gravacao de voz) e a secao 11 promete importacao
 * de arquivos de som. Nada disso e esta fatia. O que esta aqui e o pedaco sem
 * o qual a regra-modelo da secao 7 — *"abre a porta **e toca som**"* — nao
 * poderia ser montada: um punhado de sons **sintetizados na hora**.
 *
 * Sintetizados, e nao gravados, por tres razoes que valem mais que a
 * fidelidade:
 *
 * 1. **Nao pesam nada.** O orcamento da secao 3 da 15 MB para um jogo
 *    publicado inteiro; um banco de efeitos em OGG comeria uma fatia disso
 *    antes de existir uma fase.
 * 2. **Nao dependem de rede.** O editor e offline-first (secao 2), e um som
 *    que so toca depois de baixar nao e offline-first.
 * 3. **Nao dependem da M8.** Importar arquivo de som e a proxima fatia. Ate
 *    la, "tocar som" precisa fazer alguma coisa de verdade, senao a regra
 *    ensina errado: a familia monta, nao ouve nada, e conclui que nao
 *    funciona.
 *
 * Quando a M8 chegar, `tocarSom` passa a aceitar tambem o nome de um arquivo
 * importado — e estes continuam valendo, como o kit inicial que a secao 11
 * pede que ja venha instalado.
 */

export type NomeDeSom = 'anel' | 'mola' | 'porta' | 'pulo' | 'erro' | 'vitoria' | 'aviso';

/** Os sons que existem, na ordem em que a interface os oferece. */
export const SONS: readonly NomeDeSom[] = [
  'anel',
  'mola',
  'porta',
  'pulo',
  'erro',
  'vitoria',
  'aviso',
];

/** Uma nota: forma da onda, de que frequencia para qual, e quanto dura. */
interface Nota {
  onda: OscillatorType;
  de: number;
  para: number;
  duracao: number;
  volume: number;
  /** Atraso desde o inicio do som, para acorde virar arpejo. */
  atraso?: number;
}

/**
 * A receita de cada som.
 *
 * Sao poucas notas de proposito. Um efeito de jogo tem que ser reconhecido em
 * menos de meio segundo e tocado dez vezes seguidas sem cansar — e o que
 * consegue as duas coisas e ser curto, e nao ser rico.
 */
const RECEITAS: Record<NomeDeSom, Nota[]> = {
  // O anel do Sonic: duas notas subindo, rapidas e brilhantes.
  anel: [
    { onda: 'triangle', de: 988, para: 988, duracao: 0.07, volume: 0.28 },
    { onda: 'triangle', de: 1319, para: 1319, duracao: 0.14, volume: 0.24, atraso: 0.06 },
  ],
  // A mola: uma subida rapida, que e o som de alguma coisa te jogando longe.
  mola: [{ onda: 'square', de: 220, para: 880, duracao: 0.22, volume: 0.22 }],
  // A porta: grave, descendo — peso saindo do caminho.
  porta: [
    { onda: 'sawtooth', de: 180, para: 90, duracao: 0.32, volume: 0.2 },
    { onda: 'sine', de: 90, para: 60, duracao: 0.36, volume: 0.16, atraso: 0.06 },
  ],
  pulo: [{ onda: 'square', de: 330, para: 620, duracao: 0.12, volume: 0.18 }],
  // Errar desce, e todo mundo entende isso sem precisar aprender.
  erro: [{ onda: 'sawtooth', de: 300, para: 110, duracao: 0.28, volume: 0.2 }],
  // Vitoria: tres notas subindo, um acorde tocado em arpejo.
  vitoria: [
    { onda: 'triangle', de: 523, para: 523, duracao: 0.14, volume: 0.24 },
    { onda: 'triangle', de: 659, para: 659, duracao: 0.14, volume: 0.24, atraso: 0.12 },
    { onda: 'triangle', de: 784, para: 784, duracao: 0.3, volume: 0.26, atraso: 0.24 },
  ],
  aviso: [{ onda: 'sine', de: 660, para: 660, duracao: 0.1, volume: 0.2 }],
};

const POR_NOME = new Set<string>(SONS);

export function existeSom(nome: string): nome is NomeDeSom {
  return POR_NOME.has(nome);
}

type ContextoDeAudio = AudioContext & { faisca?: GainNode };

let contexto: ContextoDeAudio | null = null;
let mestre: GainNode | null = null;
let volume = 0.7;
/** Desligado explicitamente pela interface, ou por falta de WebAudio. */
let ligado = true;

/**
 * O contexto de audio, criado na primeira vez que alguem pede um som.
 *
 * Criar so na hora nao e preguica: um navegador recusa tocar audio antes de
 * um clique, e um contexto criado no carregamento da pagina nasce suspenso e
 * frequentemente nunca acorda. Criado no primeiro `tocarSom` — que vem de
 * apertar Jogar — ele nasce vivo.
 */
function abrirContexto(): ContextoDeAudio | null {
  if (!ligado) return null;
  if (contexto) {
    // Uma aba que voltou do segundo plano devolve o contexto suspenso.
    if (contexto.state === 'suspended') void contexto.resume();
    return contexto;
  }
  const Construtor =
    typeof globalThis.AudioContext === 'function'
      ? globalThis.AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  // Sem WebAudio — teste em Node, navegador antigo, aba com audio bloqueado —
  // o jogo roda igual, e em silencio. Som nunca pode ser motivo de erro.
  if (typeof Construtor !== 'function') {
    ligado = false;
    return null;
  }
  try {
    contexto = new Construtor() as ContextoDeAudio;
  } catch {
    ligado = false;
    return null;
  }
  mestre = contexto.createGain();
  mestre.gain.value = volume;
  mestre.connect(contexto.destination);
  return contexto;
}

/**
 * Toca um som. Devolve se ele saiu mesmo.
 *
 * Nunca lanca: um som que falta ou um navegador sem audio nao pode derrubar
 * o script de uma peca no meio de uma partida.
 */
export function tocarSom(nome: string): boolean {
  if (!existeSom(nome)) return false;
  const ctx = abrirContexto();
  if (!ctx || !mestre) return false;

  const agora = ctx.currentTime;
  for (const nota of RECEITAS[nome]) {
    const inicio = agora + (nota.atraso ?? 0);
    const fim = inicio + nota.duracao;

    const oscilador = ctx.createOscillator();
    oscilador.type = nota.onda;
    oscilador.frequency.setValueAtTime(nota.de, inicio);
    if (nota.para !== nota.de) oscilador.frequency.exponentialRampToValueAtTime(nota.para, fim);

    const envelope = ctx.createGain();
    // Subida de 8 ms e queda ate quase zero: sem a subida, o comeco estala; e
    // exponencial nao chega a zero, entao a queda mira num valor minusculo.
    envelope.gain.setValueAtTime(0.0001, inicio);
    envelope.gain.exponentialRampToValueAtTime(nota.volume, inicio + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, fim);

    oscilador.connect(envelope);
    envelope.connect(mestre);
    oscilador.start(inicio);
    oscilador.stop(fim + 0.02);
  }
  return true;
}

/** Volume geral, de 0 a 1. */
export function volumeDosSons(valor: number): void {
  volume = Math.min(1, Math.max(0, valor));
  if (mestre) mestre.gain.value = volume;
}

/** Desliga o audio de vez nesta sessao. Serve para o teste e para o silêncio. */
export function silenciar(): void {
  ligado = false;
  if (contexto) {
    void contexto.close();
    contexto = null;
    mestre = null;
  }
}
