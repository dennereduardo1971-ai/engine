import { describe, expect, it } from 'vitest';
import { Narrador, narracaoDoControle, type Voz } from '../src/index.ts';

/** Uma voz de mentira que anota o que foi pedido, em ordem. */
function vozDeTeste() {
  const ditas: string[] = [];
  const calou: number[] = [];
  const voz: Voz = {
    falar: (texto) => void ditas.push(texto),
    calar: () => void calou.push(ditas.length),
  };
  return { voz, ditas, calou };
}

describe('narrador do Modo Criança', () => {
  it('calado por padrão: sem ligar, ninguém fala', () => {
    const { voz, ditas } = vozDeTeste();
    const narrador = new Narrador();
    narrador.usarVoz(voz);

    expect(narrador.falar('Jogar')).toBe(false);
    expect(ditas).toEqual([]);
  });

  it('sem voz não fala, mesmo ligado — o navegador pode não ter', () => {
    const narrador = new Narrador({ ligado: true });
    expect(narrador.temVoz).toBe(false);
    expect(narrador.falar('Jogar')).toBe(false);
  });

  it('fala nova cala a anterior, em vez de fazer fila', () => {
    const { voz, ditas, calou } = vozDeTeste();
    const narrador = new Narrador({ ligado: true });
    narrador.usarVoz(voz);

    narrador.falar('Peças');
    narrador.falar('Jogar');
    expect(ditas).toEqual(['Peças', 'Jogar']);
    // Calou antes de cada uma das duas falas.
    expect(calou).toEqual([0, 1]);
  });

  it('não repete o que acabou de dizer, mas repete se pedirem', () => {
    const { voz, ditas } = vozDeTeste();
    const narrador = new Narrador({ ligado: true });
    narrador.usarVoz(voz);

    expect(narrador.falar('Jogar')).toBe(true);
    expect(narrador.falar('Jogar')).toBe(false);
    expect(narrador.falar('  Jogar\n ')).toBe(false); // espaço a mais não é outra frase
    expect(narrador.falar('Jogar', true)).toBe(true);
    expect(ditas).toEqual(['Jogar', 'Jogar']);
  });

  it('texto vazio é silêncio, e não uma fala em branco', () => {
    const { voz, ditas } = vozDeTeste();
    const narrador = new Narrador({ ligado: true });
    narrador.usarVoz(voz);

    expect(narrador.falar('   ')).toBe(false);
    expect(ditas).toEqual([]);
  });

  it('calar esquece: a mesma frase volta a ser dita depois', () => {
    const { voz, ditas } = vozDeTeste();
    const narrador = new Narrador({ ligado: true });
    narrador.usarVoz(voz);

    narrador.falar('Jogar');
    expect(narrador.dito).toBe('Jogar');
    narrador.calar();
    expect(narrador.dito).toBe('');
    expect(narrador.falar('Jogar')).toBe(true);
    expect(ditas).toEqual(['Jogar', 'Jogar']);
  });

  it('desligar cala o que estava no ar', () => {
    const { voz, calou } = vozDeTeste();
    const narrador = new Narrador({ ligado: true });
    narrador.usarVoz(voz);
    narrador.falar('Uma frase longa');

    narrador.setLigado(false);
    expect(calou.length).toBe(2);
    expect(narrador.falar('Outra')).toBe(false);
  });

  it('trocar de voz cala a antiga — sair do Modo Criança não deixa som órfão', () => {
    const antiga = vozDeTeste();
    const nova = vozDeTeste();
    const narrador = new Narrador({ ligado: true });
    narrador.usarVoz(antiga.voz);
    narrador.falar('Peças');

    narrador.usarVoz(nova.voz);
    expect(antiga.calou.length).toBe(2);
    // Esqueceu o que dizia: a mesma frase na voz nova é dita.
    expect(narrador.falar('Peças')).toBe(true);
    expect(nova.ditas).toEqual(['Peças']);
  });

  it('a narração de um controle é o rótulo e depois a ajuda', () => {
    expect(narracaoDoControle('Jogar', 'Testa a fase agora')).toBe('Jogar. Testa a fase agora');
    expect(narracaoDoControle('Jogar')).toBe('Jogar');
    expect(narracaoDoControle('', 'Baixa o arquivo')).toBe('Baixa o arquivo');
    // Rótulo igual à ajuda não é dito duas vezes.
    expect(narracaoDoControle('Baixar', 'Baixar')).toBe('Baixar');
  });
});
