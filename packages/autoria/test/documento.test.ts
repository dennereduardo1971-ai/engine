import { beforeEach, describe, expect, it } from 'vitest';
import { History, SceneDocument, type SceneChange } from '../src/index.ts';

/**
 * O documento e o que o editor edita e o que o arquivo guarda. Estes testes
 * travam o contrato dele: a arvore nunca fica quebrada, quem escuta recebe um
 * aviso por mudanca (e e desse aviso que o hot reload vive), e desfazer volta
 * ao estado exato de antes.
 */

let doc: SceneDocument;

beforeEach(() => {
  doc = new SceneDocument('Fase de teste');
});

describe('arvore de cena', () => {
  it('cria, acha e conta nos', () => {
    const reta = doc.add('reta', { name: 'Reta A' });
    expect(doc.count).toBe(1);
    expect(doc.get(reta.id)?.name).toBe('Reta A');
    expect(doc.children(null)).toHaveLength(1);
  });

  it('apagar o pai leva o galho inteiro junto', () => {
    const pista = doc.add('grupo', { name: 'Pista' });
    const reta = doc.add('reta', { parent: pista.id });
    doc.add('anel', { parent: reta.id });
    expect(doc.count).toBe(3);

    doc.remove(pista.id);
    expect(doc.count).toBe(0);
  });

  it('recusa pendurar um no dentro do proprio galho', () => {
    const pai = doc.add('grupo');
    const filho = doc.add('reta', { parent: pai.id });

    // Isso soltaria os dois da arvore e eles sumiriam da interface.
    expect(doc.setParent(pai.id, filho.id)).toBe(false);
    expect(doc.get(pai.id)?.parent).toBe(null);
    expect(doc.setParent(pai.id, pai.id)).toBe(false);
  });

  it('duplicar copia o galho e da um nome novo', () => {
    const pista = doc.add('grupo', { name: 'Pista' });
    doc.add('reta', { parent: pista.id, name: 'Reta A' });

    const copia = doc.duplicate(pista.id, { x: 8, y: 0, z: 0 });
    expect(copia?.name).toBe('Pista 2');
    expect(copia?.transform.x).toBe(8);
    expect(doc.count).toBe(4);
    // O filho da copia aponta para a copia, e nao para o original.
    expect(doc.children(copia!.id)).toHaveLength(1);
    expect(doc.children(pista.id)).toHaveLength(1);
  });

  it('carregar um arquivo nao repete ids ja usados', () => {
    const dados = {
      format: '0.1',
      name: 'Fase',
      nodes: [
        {
          id: 'n7',
          name: 'Reta',
          piece: 'reta',
          parent: null,
          transform: { x: 0, y: 0, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1 },
          fields: {},
          color: null,
          visible: true,
        },
      ],
    };
    doc.load(dados);
    const novo = doc.add('anel');
    expect(novo.id).not.toBe('n7');
    expect(doc.get('n7')).not.toBeNull();
  });

  it('pai que nao existe mais vira raiz, em vez de sumir', () => {
    doc.load({
      format: '0.1',
      name: 'Fase',
      nodes: [
        {
          id: 'n1',
          name: 'Órfão',
          piece: 'reta',
          parent: 'n99',
          transform: { x: 0, y: 0, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1 },
          fields: {},
          color: null,
          visible: true,
        },
      ],
    });
    expect(doc.get('n1')?.parent).toBe(null);
    expect(doc.children(null)).toHaveLength(1);
  });
});

describe('avisos de mudanca', () => {
  it('avisa uma vez por mudanca, com o tipo certo', () => {
    const avisos: SceneChange[] = [];
    doc.on((change) => avisos.push(change));

    const no = doc.add('reta');
    doc.setTransform(no.id, { x: 4 });
    doc.setField(no.id, 'SpeedCharacter', 'maxSpeed', 30);
    doc.rename(no.id, 'Reta B');

    expect(avisos.map((a) => a.kind)).toEqual(['add', 'transform', 'fields', 'name']);
  });

  it('nao avisa quando o valor nao mudou', () => {
    const no = doc.add('reta', { transform: { x: 4 } });
    let contagem = 0;
    doc.on(() => contagem++);

    doc.setTransform(no.id, { x: 4 });
    doc.rename(no.id, no.name);
    doc.setField(no.id, 'SpeedCharacter', 'maxSpeed', 30);
    doc.setField(no.id, 'SpeedCharacter', 'maxSpeed', 30);

    // So a primeira escrita do campo vale.
    expect(contagem).toBe(1);
  });
});

describe('desfazer e refazer', () => {
  it('volta ao estado de antes e avanca de novo', () => {
    const historico = new History(doc);
    const no = doc.add('reta', { transform: { x: 0 } });

    historico.record('mover');
    doc.setTransform(no.id, { x: 12 });
    expect(doc.get(no.id)?.transform.x).toBe(12);

    expect(historico.undo()).toBe(true);
    expect(doc.get(no.id)?.transform.x).toBe(0);
    expect(historico.redo()).toBe(true);
    expect(doc.get(no.id)?.transform.x).toBe(12);
  });

  it('junta um arrasto inteiro num passo so', () => {
    let agora = 0;
    const historico = new History(doc, { now: () => agora, coalesceMs: 500 });
    const no = doc.add('reta');

    historico.record('mover', `pos:${no.id}`);
    for (let i = 1; i <= 20; i++) {
      agora += 16;
      historico.record('mover', `pos:${no.id}`);
      doc.setTransform(no.id, { x: i });
    }

    historico.undo();
    // Um unico passo desfaz o arrasto inteiro.
    expect(doc.get(no.id)?.transform.x).toBe(0);
    expect(historico.canUndo).toBe(false);
  });

  it('desfazer traz de volta o que foi apagado', () => {
    const historico = new History(doc);
    const no = doc.add('reta', { name: 'Reta A' });

    historico.record('apagar');
    doc.remove(no.id);
    expect(doc.count).toBe(0);

    historico.undo();
    expect(doc.count).toBe(1);
    expect(doc.nodes[0].name).toBe('Reta A');
  });
});
