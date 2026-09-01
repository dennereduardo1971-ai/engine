import { describe, expect, it } from 'vitest';
import { faseDeExemplo, readScene, SceneDocument, writeScene } from '../src/index.ts';

/**
 * A secao 5 do plano promete que um `git diff` da fase mostra o que mudou. Um
 * formato so cumpre isso se duas coisas valerem: ida e volta sem perder nada,
 * e uma peca por linha, para mover uma peca mudar uma linha.
 */
describe('formato .cena', () => {
  it('vai e volta sem perder nada', () => {
    const original = faseDeExemplo();
    const lido = readScene(writeScene(original));

    expect(lido.name).toBe(original.name);
    expect(lido.nodes).toHaveLength(original.nodes.length);
    // O arquivo grava com quatro casas: 0,0001 de unidade e um decimo de
    // milimetro na escala do jogo, e o que se ganha e um arquivo legivel.
    expect(lido.nodes).toEqual(arredondar(original.nodes));
  });

  it('guarda os valores editados dos componentes', () => {
    const doc = new SceneDocument('Fase');
    const no = doc.add('inicio', { name: 'Partida' });
    doc.setField(no.id, 'SpeedCharacter', 'maxSpeed', 31.5);
    doc.setTransform(no.id, { x: 2, yaw: 45, sy: 2 });
    doc.setColor(no.id, 0xf5c542);

    const lido = readScene(writeScene(doc.toJSON()));
    const voltou = lido.nodes[0];
    expect(voltou.fields.SpeedCharacter.maxSpeed).toBe(31.5);
    expect(voltou.transform.yaw).toBe(45);
    expect(voltou.transform.sy).toBe(2);
    expect(voltou.color).toBe(0xf5c542);
  });

  it('grava uma peca por linha', () => {
    const doc = new SceneDocument('Fase');
    doc.add('reta');
    doc.add('reta');
    doc.add('anel');

    const linhas = writeScene(doc.toJSON())
      .split('\n')
      .filter((linha) => linha.trim().startsWith('{ "id"'));
    expect(linhas).toHaveLength(3);
  });

  it('nao grava o que esta no valor de fabrica', () => {
    const doc = new SceneDocument('Fase');
    doc.add('reta');
    const texto = writeScene(doc.toJSON());

    expect(texto).not.toContain('"giro"');
    expect(texto).not.toContain('"escala"');
    expect(texto).not.toContain('"campos"');
    expect(texto).not.toContain('"pai"');
  });

  it('aceita comentario e virgula sobrando, que e o que gente escreve', () => {
    const texto = `
      // a fase do fim de semana
      {
        "faisca": "0.1",
        "cena": "Fase 1",
        "nos": [
          /* o comeco */
          { "id": "n1", "nome": "Reta", "peca": "reta", "pos": [0, 0, 4] },
        ],
      }
    `;
    const lido = readScene(texto);
    expect(lido.nodes).toHaveLength(1);
    expect(lido.nodes[0].transform.z).toBe(4);
  });

  it('nao estraga uma barra dupla que esta dentro do nome', () => {
    const texto = `{ "cena": "Fase // final", "nos": [] }`;
    expect(readScene(texto).name).toBe('Fase // final');
  });

  it('erra em portugues quando o arquivo esta quebrado', () => {
    expect(() => readScene('{ isto nao e uma cena')).toThrow(/Faísca: não consegui ler/);
    expect(() => readScene('{ "cena": "Fase" }')).toThrow(/lista "nos"/);
  });

  it('numero comprido nao vaza para o arquivo', () => {
    const doc = new SceneDocument('Fase');
    const no = doc.add('reta');
    doc.setTransform(no.id, { x: 0.1 + 0.2 });
    expect(writeScene(doc.toJSON())).toContain('[0.3, 0, 0]');
  });
});

/** Mesma casa decimal que o arquivo guarda. */
function arredondar<T>(valor: T): T {
  if (typeof valor === 'number') return (Math.round(valor * 10_000) / 10_000) as T;
  if (Array.isArray(valor)) return valor.map(arredondar) as T;
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor)) saida[chave] = arredondar(item);
    return saida as T;
  }
  return valor;
}
