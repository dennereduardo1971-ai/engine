import { describe, expect, it } from 'vitest';
import { acharEvento, EVENTOS } from '../src/catalogo.ts';
import { conferir } from '../src/conferir.ts';
import { ler } from '../src/ler.ts';
import { Instancia, type Ambiente } from '../src/interpretar.ts';

/**
 * O gatilho "quando o botão for clicado" (M9). Diferente dos outros eventos,
 * ele não vem da cena 3D: vem da tela montada no painel Tela, e o que entrega
 * é o **nome** do botão — que é o que a pessoa escreveu no inspetor e o que
 * ela lê dentro da regra.
 */
describe('AoClicar', () => {
  it('está no catálogo, entregando o nome do botão', () => {
    const evento = acharEvento('AoClicar');
    expect(evento?.forma).toBe('quando o botão for clicado');
    expect(evento?.parametro).toBe('botao');
    expect(EVENTOS.filter((e) => e.nome === 'AoClicar')).toHaveLength(1);
  });

  it('passa pelo conferidor como qualquer outro "quando"', () => {
    const leitura = ler('on(AoClicar, (botao) => {\n  dizer(botao);\n});\n');
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(conferir(leitura.script)).toEqual([]);
  });

  it('roda com o nome do botão dentro da regra', () => {
    const leitura = ler('on(AoClicar, (botao) => {\n  dizer(botao);\n});\n');
    if (!leitura.ok) throw new Error(leitura.erro.mensagem);

    const feito: string[] = [];
    const ambiente: Ambiente = {
      chamar(nome, argumentos) {
        feito.push(`${nome}(${argumentos.join(', ')})`);
        return;
      },
      constante() {
        return undefined;
      },
    };

    const instancia = new Instancia(leitura.script, ambiente);
    expect(instancia.disparar('AoClicar', 'Começar')).toBe(null);
    expect(feito).toEqual(['dizer(Começar)']);
  });
});
