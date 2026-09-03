import { describe, expect, it } from 'vitest';
import { CamposVivos, UiDocument } from '../src/index.ts';

describe('CamposVivos', () => {
  it('escreve no campo do no o que a fonte devolver', () => {
    const doc = new UiDocument('Tela 1');
    const barra = doc.add('barra');
    const vivos = new CamposVivos(doc);
    let vida = 0.5;
    vivos.ligar(barra.id, 'valor', () => vida);

    vivos.atualizar();
    expect(doc.get(barra.id)?.fields.valor).toBe(0.5);

    vida = 0.25;
    vivos.atualizar();
    expect(doc.get(barra.id)?.fields.valor).toBe(0.25);
  });

  it('ligar de novo o mesmo par troca a fonte em vez de empilhar', () => {
    const doc = new UiDocument('Tela 1');
    const barra = doc.add('barra');
    const vivos = new CamposVivos(doc);
    vivos.ligar(barra.id, 'valor', () => 1);
    vivos.ligar(barra.id, 'valor', () => 0.2);
    expect(vivos.count).toBe(1);

    vivos.atualizar();
    expect(doc.get(barra.id)?.fields.valor).toBe(0.2);
  });

  it('desliga um campo, todos os campos de um no, ou a lista inteira', () => {
    const doc = new UiDocument('Tela 1');
    const barra = doc.add('barra');
    const outra = doc.add('barra');
    const vivos = new CamposVivos(doc);
    vivos.ligar(barra.id, 'valor', () => 1);
    vivos.ligar(barra.id, 'opacidade', () => 1);
    vivos.ligar(outra.id, 'valor', () => 1);

    vivos.desligar(barra.id, 'opacidade');
    expect(vivos.count).toBe(2);

    vivos.desligar(barra.id);
    expect(vivos.lista.map((ligacao) => ligacao.id)).toEqual([outra.id]);

    vivos.limpar();
    expect(vivos.count).toBe(0);
  });

  it('arredonda pelo passo para nao remexer no estilo a cada quadro', () => {
    const doc = new UiDocument('Tela 1');
    const barra = doc.add('barra');
    const vivos = new CamposVivos(doc);
    vivos.ligar(barra.id, 'valor', () => 0.123456, 0.01);

    vivos.atualizar();
    expect(doc.get(barra.id)?.fields.valor).toBeCloseTo(0.12, 10);
  });

  it('passo zero escreve o valor cru', () => {
    const doc = new UiDocument('Tela 1');
    const barra = doc.add('barra');
    const vivos = new CamposVivos(doc);
    vivos.ligar(barra.id, 'valor', () => 0.123456);

    vivos.atualizar();
    expect(doc.get(barra.id)?.fields.valor).toBe(0.123456);
  });

  it('esquece a ligacao de um no que sumiu da tela', () => {
    const doc = new UiDocument('Tela 1');
    const barra = doc.add('barra');
    const vivos = new CamposVivos(doc);
    let leituras = 0;
    vivos.ligar(barra.id, 'valor', () => {
      leituras += 1;
      return 1;
    });

    doc.remove(barra.id);
    vivos.atualizar();
    vivos.atualizar();
    expect(leituras).toBe(0);
    expect(vivos.count).toBe(0);
  });

  it('valor que nao e numero deixa o campo como estava', () => {
    const doc = new UiDocument('Tela 1');
    const barra = doc.add('barra');
    const vivos = new CamposVivos(doc);
    let valor = 0.4;
    vivos.ligar(barra.id, 'valor', () => valor);
    vivos.atualizar();

    valor = Number.NaN;
    vivos.atualizar();
    expect(doc.get(barra.id)?.fields.valor).toBe(0.4);
  });
});
