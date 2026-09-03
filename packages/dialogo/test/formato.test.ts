import { describe, expect, it } from 'vitest';
import { Conversa, readDialogo, writeDialogo } from '../src/index.ts';

describe('formato .dialogo', () => {
  it('grava e le de volta a mesma conversa', () => {
    const conversa = new Conversa('Encontro');
    const a = conversa.add('Pai', 'Vamos jogar?');
    const b = conversa.add('Pai', 'Boa!');
    conversa.addOpcao(a.id, 'Vamos', b.id);
    conversa.addOpcao(a.id, 'Agora não');

    const lido = readDialogo(writeDialogo(conversa.toData()));
    expect(lido).toEqual(conversa.toData());
  });

  it('o narrador e as ligacoes de fim nao sujam o arquivo', () => {
    const conversa = new Conversa('Solta');
    conversa.add('', 'Era uma vez.');
    const linha = writeDialogo(conversa.toData())
      .split('\n')
      .find((l) => l.includes('"fala"'))!;
    expect(linha).toBe('    { "id": "p1", "fala": "Era uma vez." }');
  });

  it('aceita comentario, virgula sobrando e opcao escrita so como texto', () => {
    const lido = readDialogo(`
      // uma conversa escrita na mão
      {
        "conversa": "Escrita à mão",
        "passos": [
          { "quem": "Pai", "fala": "Vamos // embora?", "opcoes": ["Sim", "Não"] },
        ],
      }
    `);
    expect(lido.name).toBe('Escrita à mão');
    expect(lido.passos[0]?.id).toBe('p1');
    expect(lido.passos[0]?.texto).toBe('Vamos // embora?');
    expect(lido.passos[0]?.opcoes).toEqual([
      { texto: 'Sim', destino: null },
      { texto: 'Não', destino: null },
    ]);
  });

  it('erra em portugues quando o arquivo nao e uma conversa', () => {
    expect(() => readDialogo('{{{')).toThrow(/não consegui ler esta conversa/);
    expect(() => readDialogo('{ "conversa": "x" }')).toThrow(/não tem a lista "passos"/);
    expect(() => readDialogo('{ "passos": [ { "id": "p1" } ] }')).toThrow(
      /a fala número 1 da conversa não tem o texto/,
    );
    expect(() => readDialogo('{ "passos": [ 7 ] }')).toThrow(/a fala número 1 da conversa/);
  });
});
