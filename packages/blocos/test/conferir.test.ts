import { describe, expect, it } from 'vitest';
import { conferir } from '../src/conferir.ts';
import { ler } from '../src/ler.ts';
import { type Script } from '../src/arvore.ts';

function arvore(codigo: string): Script {
  const leitura = ler(codigo);
  if (!leitura.ok) throw new Error(leitura.erro.mensagem);
  return leitura.script;
}

/**
 * O plano pede erros em portugues, com o bloco culpado destacado e uma
 * correcao sugerida. Cada teste aqui cobra as tres coisas: a frase, o caminho
 * ate o bloco, e o palpite.
 */
describe('erros em português', () => {
  it('bloco que não existe, com palpite', () => {
    const [problema] = conferir(arvore('darAneiss(3);\n'));
    expect(problema.mensagem).toBe('Não conheço o bloco "darAneiss".');
    expect(problema.sugestao).toBe('Você quis dizer "darAneis"?');
    expect(problema.caminho).toEqual([0]);
  });

  it('conta errada de valores, mostrando a forma do bloco', () => {
    const [problema] = conferir(arvore('mover(1);\n'));
    expect(problema.mensagem).toBe('O bloco "mover" espera 3 valores, e recebeu 1.');
    expect(problema.sugestao).toBe('A forma dele é: mover {x} {y} {z}');
  });

  it('caixinha usada antes de existir', () => {
    const [problema] = conferir(arvore('pontos = 1;\n'));
    expect(problema.mensagem).toBe('A caixinha "pontos" ainda não foi criada.');
    expect(problema.sugestao).toBe('Crie ela antes com: let pontos = 0;');
  });

  it('evento que não existe', () => {
    const [problema] = conferir(arvore('on(AoPular, () => {\n  mostrar();\n});\n'));
    expect(problema.mensagem).toBe('Não conheço o evento "AoPular".');
  });

  it('bloco de valor usado como ação', () => {
    const [problema] = conferir(arvore('aneis();\n'));
    expect(problema.mensagem).toBe('"aneis" dá um valor, mas não faz nada sozinho.');
    expect(problema.sugestao).toContain('let x = aneis();');
  });

  it('aponta o bloco culpado lá no fundo', () => {
    const script = arvore(
      'on(AoComecar, () => {\n  if (true) {\n    mostrar();\n    darAneiss(1);\n  }\n});\n',
    );
    const [problema] = conferir(script);
    // quando[0] → corpo → se[0] → ramo "entao"(0) → segunda instrução(1)
    expect(problema.caminho).toEqual([0, 0, 0, 1]);
  });

  it('script certo não tem nada a dizer', () => {
    const script = arvore(
      'let voltas = 0;\non(AoEncostar, (jogador) => {\n  voltas = voltas + 1;\n  darAneis(voltas);\n});\n',
    );
    expect(conferir(script)).toEqual([]);
  });

  it('o parâmetro do evento vale dentro dele', () => {
    const script = arvore('on(AoEncostar, (jogador) => {\n  dizer(jogador);\n});\n');
    expect(conferir(script)).toEqual([]);
  });

  it('mas não vale fora dele', () => {
    const script = arvore('on(AoEncostar, (jogador) => {\n  mostrar();\n});\ndizer(jogador);\n');
    expect(conferir(script)[0].mensagem).toBe('Não sei o que é "jogador".');
  });
});

describe('erros de escrita', () => {
  it('ponto e vírgula esquecido', () => {
    const leitura = ler('mostrar()\n');
    expect(leitura.ok).toBe(false);
    if (leitura.ok) return;
    expect(leitura.erro.mensagem).toBe('Faltou ";" no fim da linha.');
    expect(leitura.erro.linha).toBe(2);
  });

  it('chave que não fecha', () => {
    const leitura = ler('on(AoComecar, () => {\n  mostrar();\n');
    expect(leitura.ok).toBe(false);
    if (leitura.ok) return;
    expect(leitura.erro.mensagem).toContain('Faltou "}"');
  });

  it('texto que não fecha', () => {
    const leitura = ler('dizer("oi);\n');
    expect(leitura.ok).toBe(false);
    if (leitura.ok) return;
    expect(leitura.erro.mensagem).toBe('Este texto começou e não terminou.');
    expect(leitura.erro.linha).toBe(1);
  });

  it('senão solto', () => {
    const leitura = ler('else {\n}\n');
    expect(leitura.ok).toBe(false);
    if (leitura.ok) return;
    expect(leitura.erro.mensagem).toContain('está solto');
  });

  it('diz a linha e a coluna do problema', () => {
    const leitura = ler('mostrar();\nmover(1, 2, );\n');
    expect(leitura.ok).toBe(false);
    if (leitura.ok) return;
    expect(leitura.erro.linha).toBe(2);
    expect(leitura.erro.coluna).toBeGreaterThan(10);
  });
});
