import { describe, expect, it } from 'vitest';
import { ler } from '../src/ler.ts';
import { Instancia, type Ambiente, type Valor } from '../src/interpretar.ts';

function rodar(codigo: string) {
  const leitura = ler(codigo);
  if (!leitura.ok) throw new Error(leitura.erro.mensagem);

  const feito: string[] = [];
  const mundo: Record<string, Valor> = { aneis: 0, tempo: 0 };
  const ambiente: Ambiente = {
    chamar(nome, argumentos) {
      feito.push(`${nome}(${argumentos.join(', ')})`);
      if (nome === 'aneis') return mundo.aneis;
      if (nome === 'tempo') return mundo.tempo;
      if (nome === 'darAneis') {
        mundo.aneis = (mundo.aneis as number) + (argumentos[0] as number);
        return;
      }
      if (nome === 'desconhecido') throw new Error(`Não conheço o bloco "${nome}".`);
      return;
    },
    constante(nome) {
      return nome === 'CIMA' ? 1 : undefined;
    },
  };

  return { instancia: new Instancia(leitura.script, ambiente), feito, mundo };
}

describe('a árvore rodando', () => {
  it('faz o que está fora dos eventos, uma vez', () => {
    const { instancia, feito } = rodar('dizer("oi");\nmostrar();\n');
    expect(instancia.iniciar()).toBe(null);
    expect(feito).toEqual(['dizer(oi)', 'mostrar()']);
  });

  it('só dispara o evento pedido', () => {
    const { instancia, feito } = rodar(
      'on(AoComecar, () => {\n  dizer("começou");\n});\non(AoEncostar, (jogador) => {\n  dizer("encostou");\n});\n',
    );
    instancia.disparar('AoEncostar');
    expect(feito).toEqual(['dizer(encostou)']);
  });

  it('entrega ao evento o que ele recebe', () => {
    const { instancia, feito } = rodar('on(AoEncostar, (jogador) => {\n  dizer(jogador);\n});\n');
    instancia.disparar('AoEncostar', 'Sonic');
    expect(feito).toEqual(['dizer(Sonic)']);
  });

  it('a caixinha continua valendo de um evento para o outro', () => {
    const { instancia } = rodar(
      'let voltas = 0;\non(AoEncostar, () => {\n  voltas = voltas + 1;\n});\n',
    );
    instancia.iniciar();
    instancia.disparar('AoEncostar');
    instancia.disparar('AoEncostar');
    instancia.disparar('AoEncostar');
    expect(instancia.ver('voltas')).toBe(3);
  });

  it('escolhe o caminho do se', () => {
    const { instancia, feito, mundo } = rodar(
      'on(AoComecar, () => {\n  if (aneis() > 0) {\n    dizer("tem");\n  } else {\n    dizer("não tem");\n  }\n});\n',
    );
    instancia.disparar('AoComecar');
    expect(feito.at(-1)).toBe('dizer(não tem)');

    mundo.aneis = 5;
    instancia.disparar('AoComecar');
    expect(feito.at(-1)).toBe('dizer(tem)');
  });

  it('repete com o enquanto', () => {
    const { instancia, mundo } = rodar(
      'on(AoComecar, () => {\n  let i = 0;\n  while (i < 5) {\n    darAneis(2);\n    i = i + 1;\n  }\n});\n',
    );
    expect(instancia.disparar('AoComecar')).toBe(null);
    expect(mundo.aneis).toBe(10);
  });

  it('usa as constantes do jogo', () => {
    const { instancia, feito } = rodar('on(AoComecar, () => {\n  dizer(CIMA);\n});\n');
    instancia.disparar('AoComecar');
    expect(feito).toEqual(['dizer(1)']);
  });

  it('soma texto juntando e número contando', () => {
    const { instancia, feito } = rodar(
      'on(AoComecar, () => {\n  dizer("anéis: " + 3);\n  dizer(2 + 3);\n});\n',
    );
    instancia.disparar('AoComecar');
    expect(feito).toEqual(['dizer(anéis: 3)', 'dizer(5)']);
  });
});

describe('quando o script se enrola', () => {
  it('para o laço infinito em vez de travar a aba', () => {
    const { instancia } = rodar('on(AoComecar, () => {\n  while (true) {\n    dizer("oi");\n  }\n});\n');
    const erro = instancia.disparar('AoComecar');
    expect(erro?.mensagem).toBe('Este script está rodando sem parar.');
    expect(erro?.sugestao).toContain('enquanto');
  });

  it('avisa da divisão por zero', () => {
    const { instancia } = rodar('on(AoComecar, () => {\n  dizer(1 / 0);\n});\n');
    expect(instancia.disparar('AoComecar')?.mensagem).toBe('Não dá para dividir por zero.');
  });

  it('avisa da caixinha que não existe', () => {
    const { instancia } = rodar('on(AoComecar, () => {\n  dizer(pontos);\n});\n');
    const erro = instancia.disparar('AoComecar');
    expect(erro?.mensagem).toBe('Não sei o que é "pontos".');
    expect(erro?.sugestao).toBe('Crie antes com: let pontos = 0;');
  });

  it('devolve o erro que o mundo levantou', () => {
    const { instancia } = rodar('on(AoComecar, () => {\n  desconhecido();\n});\n');
    expect(instancia.disparar('AoComecar')?.mensagem).toBe('Não conheço o bloco "desconhecido".');
  });

  it('um evento que falha não impede o próximo disparo', () => {
    const { instancia, feito } = rodar(
      'on(AoComecar, () => {\n  dizer(pontos);\n});\non(AoEncostar, () => {\n  dizer("ok");\n});\n',
    );
    instancia.disparar('AoComecar');
    instancia.disparar('AoEncostar');
    expect(feito.at(-1)).toBe('dizer(ok)');
  });
});
