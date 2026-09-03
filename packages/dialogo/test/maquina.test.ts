import { describe, expect, it } from 'vitest';
import { Conversa, Conversando } from '../src/index.ts';

function conversaDeTeste(): Conversa {
  const conversa = new Conversa('Encontro');
  const a = conversa.add('Pai', 'Vamos jogar?');
  const sim = conversa.add('Pai', 'Boa!');
  const nao = conversa.add('Pai', 'Fica pra depois.');
  conversa.setProxima(sim.id, null);
  conversa.addOpcao(a.id, 'Vamos', sim.id);
  conversa.addOpcao(a.id, 'Agora não', nao.id);
  return conversa;
}

describe('Conversando', () => {
  it('comeca no primeiro passo e mostra as escolhas', () => {
    const jogo = new Conversando(conversaDeTeste().toData());
    expect(jogo.balao).toEqual({
      id: 'p1',
      quem: 'Pai',
      texto: 'Vamos jogar?',
      opcoes: ['Vamos', 'Agora não'],
    });
    expect(jogo.terminou).toBe(false);
  });

  it('nao avanca sozinho numa pergunta', () => {
    const jogo = new Conversando(conversaDeTeste().toData());
    expect(jogo.avancar()).toBe(false);
    expect(jogo.balao?.id).toBe('p1');
  });

  it('escolher leva ao destino, e o fim termina a conversa', () => {
    const jogo = new Conversando(conversaDeTeste().toData());
    expect(jogo.escolher(1)).toBe(true);
    expect(jogo.balao?.texto).toBe('Fica pra depois.');
    expect(jogo.avancar()).toBe(true);
    expect(jogo.terminou).toBe(true);
    expect(jogo.balao).toBeNull();
    expect(jogo.avancar()).toBe(false);
  });

  it('opcao que nao existe nao mexe no cursor', () => {
    const jogo = new Conversando(conversaDeTeste().toData());
    expect(jogo.escolher(9)).toBe(false);
    expect(jogo.balao?.id).toBe('p1');
  });

  it('comeca no passo pedido, e ignora um id que nao existe', () => {
    const dados = conversaDeTeste().toData();
    expect(new Conversando(dados, 'p3').balao?.texto).toBe('Fica pra depois.');
    expect(new Conversando(dados, 'nao-existe').balao?.id).toBe('p1');
  });

  it('rodar duas vezes nao suja o documento', () => {
    const conversa = conversaDeTeste();
    const dados = conversa.toData();
    const primeira = new Conversando(dados);
    primeira.escolher(0);
    primeira.avancar();
    const segunda = new Conversando(dados);
    expect(segunda.balao?.opcoes).toEqual(['Vamos', 'Agora não']);
    expect(segunda.terminou).toBe(false);
  });

  it('guarda por onde passou e reiniciar volta ao comeco', () => {
    const jogo = new Conversando(conversaDeTeste().toData());
    jogo.escolher(0);
    expect(jogo.visitados).toEqual(['p1', 'p2']);
    jogo.reiniciar();
    expect(jogo.visitados).toEqual(['p1']);
    expect(jogo.balao?.id).toBe('p1');
  });

  it('uma conversa vazia ja nasce terminada', () => {
    const jogo = new Conversando(new Conversa().toData());
    expect(jogo.terminou).toBe(true);
    expect(jogo.balao).toBeNull();
  });
});
