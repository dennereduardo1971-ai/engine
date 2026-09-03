import { describe, expect, it } from 'vitest';
import {
  duracaoDe,
  readCutscene,
  Rodando,
  writeCutscene,
  type CutsceneData,
  type Marca,
} from '../src/index.ts';

function marca(id: string, em: number, duracao: number, acao: Marca['acao']): Marca {
  return { id, em, duracao, acao };
}

function cena(): CutsceneData {
  return {
    format: '1',
    name: 'Chegada',
    marcas: [
      marca('m2', 1, 2, { kind: 'falar', quem: 'Pai', texto: 'Chegamos.' }),
      marca('m1', 0, 1, { kind: 'camera', alvo: 'Câmera do portão' }),
      marca('m3', 3, 0, { kind: 'fazer', evento: 'abrir-portao' }),
    ],
  };
}

describe('Rodando (cutscene)', () => {
  it('a duracao e a marca que termina mais tarde', () => {
    expect(duracaoDe(cena().marcas)).toBe(3);
    expect(duracaoDe([])).toBe(0);
  });

  it('avanca na ordem do relogio, e nao na ordem do arquivo', () => {
    const jogo = new Rodando(cena());
    expect(jogo.avancar(0.5).map((a) => [a.kind, a.marca.id])).toEqual([['comecou', 'm1']]);
    expect(jogo.avancar(0.6).map((a) => [a.kind, a.marca.id])).toEqual([
      ['terminou', 'm1'],
      ['comecou', 'm2'],
    ]);
  });

  it('um dt grande nao come nenhuma marca', () => {
    const jogo = new Rodando(cena());
    const tudo = jogo.avancar(10).map((a) => `${a.kind}:${a.marca.id}`);
    expect(tudo).toEqual([
      'comecou:m1',
      'terminou:m1',
      'comecou:m2',
      'terminou:m2',
      'comecou:m3',
      'terminou:m3',
    ]);
    expect(jogo.terminou).toBe(true);
    expect(jogo.tempo).toBe(3);
  });

  it('uma marca instantanea comeca e termina na mesma chamada', () => {
    const jogo = new Rodando(cena());
    jogo.irPara(2.9);
    expect(jogo.avancar(0.2).map((a) => `${a.kind}:${a.marca.id}`)).toEqual([
      'terminou:m2',
      'comecou:m3',
      'terminou:m3',
    ]);
  });

  it('diz o progresso do que esta acontecendo agora', () => {
    const jogo = new Rodando(cena());
    jogo.avancar(2);
    const ativas = jogo.ativas;
    expect(ativas).toHaveLength(1);
    expect(ativas[0]?.marca.id).toBe('m2');
    expect(ativas[0]?.progresso).toBeCloseTo(0.5, 10);
    expect(jogo.fala).toEqual({ quem: 'Pai', texto: 'Chegamos.' });
  });

  it('pular deixa a cena no mesmo estado de quem assistiu', () => {
    const jogo = new Rodando(cena());
    jogo.avancar(0.5);
    const resto = jogo.pular().map((a) => `${a.kind}:${a.marca.id}`);
    expect(resto).toContain('terminou:m2');
    expect(resto).toContain('terminou:m3');
    expect(jogo.terminou).toBe(true);
    expect(jogo.ativas).toEqual([]);
    expect(jogo.fala).toBeNull();
  });

  it('o relogio nao anda para tras nem com dt esquisito', () => {
    const jogo = new Rodando(cena());
    jogo.avancar(1.5);
    expect(jogo.avancar(-1)).toEqual([]);
    expect(jogo.avancar(Number.NaN)).toEqual([]);
    expect(jogo.irPara(0)).toEqual([]);
    expect(jogo.tempo).toBe(1.5);
  });

  it('reiniciar roda a cena de novo do zero', () => {
    const jogo = new Rodando(cena());
    jogo.pular();
    jogo.reiniciar();
    expect(jogo.tempo).toBe(0);
    expect(jogo.terminou).toBe(false);
    expect(jogo.avancar(0.1).map((a) => a.marca.id)).toEqual(['m1']);
  });
});

describe('formato .cutscene', () => {
  it('grava e le de volta a mesma cena', () => {
    const dados: CutsceneData = {
      format: '1',
      name: 'Chegada',
      marcas: [
        ...cena().marcas,
        marca('m4', 4, 1, { kind: 'mover', alvo: 'Porta', para: [1, 0, -2.5] }),
        marca('m5', 5, 0.5, { kind: 'esperar' }),
      ],
    };
    expect(readCutscene(writeCutscene(dados))).toEqual(dados);
  });

  it('erra em portugues quando pede uma acao que a Faisca nao sabe', () => {
    expect(() => readCutscene('{ "marcas": [ { "faz": "explodir" } ] }')).toThrow(
      /pede "explodir", que a Faísca não sabe fazer/,
    );
    expect(() => readCutscene('{ "cutscene": "x" }')).toThrow(/não tem a lista "marcas"/);
    expect(() => readCutscene('{{{')).toThrow(/não consegui ler esta cutscene/);
  });

  it('marca sem nada vira uma espera instantanea, e nao um erro', () => {
    const lido = readCutscene('{ "marcas": [ { } ] }');
    expect(lido.marcas[0]).toEqual({ id: 'm1', em: 0, duracao: 0, acao: { kind: 'esperar' } });
  });
});
