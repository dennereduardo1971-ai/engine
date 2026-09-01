import { describe, expect, it } from 'vitest';
import { Partida, PROGRESSO_VAZIO, somarProgresso } from '../src/partida.ts';

/**
 * As regras que fazem o anel valer alguma coisa.
 *
 * Um jogo em que encostar num inimigo tira uma vida direto castiga quem esta
 * aprendendo. A regra do Sonic — o anel absorve o erro — deixa a fase dificil
 * sem ser cruel, e e ela que esta cobrada aqui.
 */
describe('partida', () => {
  it('com anel, levar dano custa os anéis e não a vida', () => {
    const p = new Partida();
    p.coletar(12);
    const perdeuVida = p.levarDano();

    expect(perdeuVida).toBe(false);
    expect(p.aneis).toBe(0);
    expect(p.vidas).toBe(3);
    expect(p.invulneravel).toBeGreaterThan(0);
  });

  it('sem anel, levar dano custa uma vida', () => {
    const p = new Partida();
    expect(p.levarDano()).toBe(true);
    expect(p.vidas).toBe(2);
  });

  it('não leva dois danos no mesmo encostão', () => {
    const p = new Partida();
    p.levarDano();
    const vidasDepoisDoPrimeiro = p.vidas;
    // Ainda piscando: o segundo toque no mesmo inimigo não conta.
    expect(p.levarDano()).toBe(false);
    expect(p.vidas).toBe(vidasDepoisDoPrimeiro);

    // Passada a imunidade, conta de novo.
    p.avancar(2);
    expect(p.levarDano()).toBe(true);
    expect(p.vidas).toBe(vidasDepoisDoPrimeiro - 1);
  });

  it('acabar as vidas termina a partida', () => {
    const p = new Partida(1);
    p.perderVida();
    expect(p.estado).toBe('perdeu');
    expect(p.vidas).toBe(0);

    // Depois de acabar, nada mais muda o placar.
    p.coletar(5);
    p.avancar(1);
    expect(p.aneis).toBe(0);
    expect(p.tempo).toBe(0);
  });

  it('o relógio anda enquanto se joga e para no fim', () => {
    const p = new Partida();
    p.avancar(1.5);
    expect(p.tempo).toBeCloseTo(1.5, 5);
    p.vencer();
    p.avancar(10);
    expect(p.tempo).toBeCloseTo(1.5, 5);
    expect(p.estado).toBe('venceu');
  });
});

describe('progresso guardado', () => {
  it('guarda o tempo da primeira vitória', () => {
    const p = new Partida();
    p.avancar(41);
    p.coletar(10);
    p.vencer();

    const progresso = somarProgresso(PROGRESSO_VAZIO, p);
    expect(progresso.concluida).toBe(true);
    expect(progresso.melhorTempo).toBeCloseTo(41, 5);
    expect(progresso.maisAneis).toBe(10);
    expect(progresso.vezesJogada).toBe(1);
  });

  it('uma partida pior não apaga o recorde', () => {
    const bom = { concluida: true, melhorTempo: 30, maisAneis: 20, vezesJogada: 1 };
    const p = new Partida();
    p.avancar(90);
    p.coletar(3);
    p.vencer();

    const depois = somarProgresso(bom, p);
    expect(depois.melhorTempo).toBe(30);
    expect(depois.maisAneis).toBe(20);
    expect(depois.vezesJogada).toBe(2);
  });

  it('perder não conta como tempo de conclusão', () => {
    const p = new Partida(1);
    p.avancar(12);
    p.perderVida();

    const depois = somarProgresso(PROGRESSO_VAZIO, p);
    expect(depois.concluida).toBe(false);
    expect(depois.melhorTempo).toBe(null);
    expect(depois.vezesJogada).toBe(1);
  });
});
