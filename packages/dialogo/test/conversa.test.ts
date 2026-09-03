import { describe, expect, it } from 'vitest';
import { Conversa, type ConversaChange } from '../src/index.ts';

describe('Conversa', () => {
  it('liga a fala anterior a nova, para quem escreve de cima para baixo', () => {
    const conversa = new Conversa();
    const a = conversa.add('Pai', 'Oi.');
    const b = conversa.add('Filho', 'Oi!');
    expect(a.proxima).toBe(b.id);
    expect(b.proxima).toBeNull();
    expect(conversa.inicio).toBe(a);
  });

  it('nao liga sozinho quando a fala anterior ja tem escolhas', () => {
    const conversa = new Conversa();
    const a = conversa.add('Pai', 'Vamos?');
    conversa.addOpcao(a.id, 'Sim');
    const b = conversa.add('Pai', 'Então vem.');
    expect(a.proxima).toBeNull();
    expect(b.proxima).toBeNull();
  });

  it('apagar um passo desfaz quem apontava para ele, sem deixar id fantasma', () => {
    const conversa = new Conversa();
    const a = conversa.add('', 'Uma.');
    const b = conversa.add('', 'Duas.');
    const c = conversa.add('', 'Três.');
    conversa.addOpcao(a.id, 'Pular', c.id);

    expect(conversa.remove(c.id)).toBe(true);
    expect(b.proxima).toBeNull();
    expect(a.opcoes[0]?.destino).toBeNull();
    expect(conversa.achar(c.id)).toBeNull();
    expect(conversa.remove(c.id)).toBe(false);
  });

  it('ligacao para um id que nao existe vira fim de conversa', () => {
    const conversa = new Conversa();
    const a = conversa.add('', 'Uma.');
    expect(conversa.setProxima(a.id, 'nao-existe')).toBe(true);
    expect(a.proxima).toBeNull();
    expect(conversa.addOpcao(a.id, 'Ir', 'nao-existe')?.destino).toBeNull();
  });

  it('avisa o que mudou, e nao a conversa inteira', () => {
    const conversa = new Conversa();
    const mudancas: ConversaChange[] = [];
    const parar = conversa.escutar((change) => mudancas.push(change));

    const a = conversa.add('Pai', 'Oi.');
    conversa.setTexto(a.id, 'Pai', 'Olá.');
    conversa.addOpcao(a.id, 'Oi!');
    conversa.renomear('Encontro');
    parar();
    conversa.add('', 'Não deve aparecer.');

    expect(mudancas.map((m) => m.kind)).toEqual(['add', 'texto', 'opcoes', 'nome']);
  });

  it('mexer numa opcao devolve false quando ela nao existe', () => {
    const conversa = new Conversa();
    const a = conversa.add('', 'Uma.');
    expect(conversa.setOpcao(a.id, 0, 'Sim', null)).toBe(false);
    expect(conversa.removeOpcao(a.id, 0)).toBe(false);
    conversa.addOpcao(a.id, 'Sim');
    expect(conversa.setOpcao(a.id, 0, 'Claro', null)).toBe(true);
    expect(a.opcoes[0]?.texto).toBe('Claro');
    expect(conversa.removeOpcao(a.id, 0)).toBe(true);
    expect(a.opcoes).toHaveLength(0);
  });

  it('toData copia, e mexer na copia nao mexe no documento', () => {
    const conversa = new Conversa('Encontro');
    const a = conversa.add('Pai', 'Oi.');
    conversa.addOpcao(a.id, 'Oi!');
    const dados = conversa.toData();
    dados.passos[0]!.texto = 'outro';
    dados.passos[0]!.opcoes[0]!.texto = 'outro';
    expect(a.texto).toBe('Oi.');
    expect(a.opcoes[0]?.texto).toBe('Oi!');
    expect(dados.name).toBe('Encontro');
  });

  it('carregar um arquivo com ligacao quebrada termina a conversa ali', () => {
    const conversa = Conversa.fromData({
      format: '1',
      name: 'Solta',
      passos: [
        { id: 'p1', quem: '', texto: 'Uma.', opcoes: [{ texto: 'Ir', destino: 'sumiu' }], proxima: 'sumiu' },
      ],
    });
    const p1 = conversa.achar('p1');
    expect(p1?.proxima).toBeNull();
    expect(p1?.opcoes[0]?.destino).toBeNull();
    // O proximo id gerado nao pode colidir com o que veio do arquivo.
    expect(conversa.add('', 'Duas.').id).not.toBe('p1');
  });
});
