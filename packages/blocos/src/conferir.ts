import { type Caminho, type Expressao, type Instrucao, type Script } from './arvore.ts';
import { acharBloco, acharEvento, BLOCOS, EVENTOS } from './catalogo.ts';

/**
 * O conferidor — os erros que o leitor nao pega.
 *
 * O leitor responde "isto esta escrito certo?". Este responde "isto faz
 * sentido?": o bloco existe, recebe a quantidade certa de coisas, a caixinha
 * foi criada antes de ser usada.
 *
 * Cada erro vem com o **caminho** ate o bloco culpado, e nao so com a linha.
 * Numero de linha so serve na visao de codigo; caminho serve nas duas, e e o
 * que deixa o editor de blocos acender o bloco errado — que e o que a secao 7
 * do plano pede.
 */

export interface Problema {
  mensagem: string;
  caminho: Caminho;
  sugestao?: string;
}

export function conferir(script: Script): Problema[] {
  const problemas: Problema[] = [];
  const conhecidas = new Set<string>();
  conferirCorpo(script.corpo, [], conhecidas, problemas, false);
  return problemas;
}

function conferirCorpo(
  corpo: Instrucao[],
  base: Caminho,
  conhecidas: Set<string>,
  problemas: Problema[],
  dentroDeEvento: boolean,
): void {
  corpo.forEach((instrucao, indice) => {
    const caminho = [...base, indice];
    switch (instrucao.tipo) {
      case 'nota':
        break;

      case 'quando': {
        if (dentroDeEvento) {
          problemas.push({
            mensagem: 'Um bloco "quando" não cabe dentro de outro.',
            caminho,
            sugestao: 'Tire ele para fora, no nível de cima.',
          });
        }
        if (!acharEvento(instrucao.evento)) {
          problemas.push({
            mensagem: `Não conheço o evento "${instrucao.evento}".`,
            caminho,
            sugestao: sugerir(instrucao.evento, EVENTOS.map((e) => e.nome)),
          });
        }
        const dentro = new Set(conhecidas);
        if (instrucao.parametro) dentro.add(instrucao.parametro);
        conferirCorpo(instrucao.corpo, [...caminho], dentro, problemas, true);
        break;
      }

      case 'fazer':
        conferirExpressao(instrucao.chamada, caminho, conhecidas, problemas, true);
        break;

      case 'criar':
        conferirExpressao(instrucao.valor, caminho, conhecidas, problemas, false);
        if (conhecidas.has(instrucao.nome)) {
          problemas.push({
            mensagem: `Já existe uma caixinha chamada "${instrucao.nome}".`,
            caminho,
            sugestao: 'Para mudar o valor dela, use só o nome, sem o "let".',
          });
        }
        conhecidas.add(instrucao.nome);
        break;

      case 'guardar':
        if (!conhecidas.has(instrucao.nome)) {
          problemas.push({
            mensagem: `A caixinha "${instrucao.nome}" ainda não foi criada.`,
            caminho,
            sugestao: `Crie ela antes com: let ${instrucao.nome} = 0;`,
          });
        }
        conferirExpressao(instrucao.valor, caminho, conhecidas, problemas, false);
        break;

      case 'se':
        conferirExpressao(instrucao.condicao, caminho, conhecidas, problemas, false);
        conferirCorpo(instrucao.entao, [...caminho, 0], new Set(conhecidas), problemas, dentroDeEvento);
        conferirCorpo(instrucao.senao, [...caminho, 1], new Set(conhecidas), problemas, dentroDeEvento);
        break;

      case 'enquanto':
        conferirExpressao(instrucao.condicao, caminho, conhecidas, problemas, false);
        conferirCorpo(instrucao.corpo, [...caminho], new Set(conhecidas), problemas, dentroDeEvento);
        break;
    }
  });
}

function conferirExpressao(
  expressao: Expressao,
  caminho: Caminho,
  conhecidas: Set<string>,
  problemas: Problema[],
  comoAcao: boolean,
): void {
  switch (expressao.tipo) {
    case 'numero':
    case 'texto':
    case 'booleano':
      break;

    case 'nome':
      // MAIUSCULAS sao constantes do jogo (CIMA, BAIXO); o resto e caixinha.
      if (!conhecidas.has(expressao.nome) && expressao.nome !== expressao.nome.toUpperCase()) {
        problemas.push({
          mensagem: `Não sei o que é "${expressao.nome}".`,
          caminho,
          sugestao: sugerir(expressao.nome, [...conhecidas, ...BLOCOS.map((b) => b.nome)]),
        });
      }
      break;

    case 'chamada': {
      const bloco = acharBloco(expressao.nome);
      if (!bloco) {
        problemas.push({
          mensagem: `Não conheço o bloco "${expressao.nome}".`,
          caminho,
          sugestao: sugerir(expressao.nome, BLOCOS.map((b) => b.nome)),
        });
      } else {
        if (expressao.argumentos.length !== bloco.parametros.length) {
          problemas.push({
            mensagem:
              `O bloco "${expressao.nome}" espera ${contar(bloco.parametros.length, 'valor', 'valores')}, ` +
              `e recebeu ${expressao.argumentos.length}.`,
            caminho,
            sugestao: `A forma dele é: ${bloco.forma}`,
          });
        }
        if (comoAcao && bloco.devolve !== null) {
          problemas.push({
            mensagem: `"${expressao.nome}" dá um valor, mas não faz nada sozinho.`,
            caminho,
            sugestao: `Use ele dentro de outro bloco, ou guarde: let x = ${expressao.nome}();`,
          });
        }
      }
      for (const argumento of expressao.argumentos) {
        conferirExpressao(argumento, caminho, conhecidas, problemas, false);
      }
      break;
    }

    case 'operacao':
      conferirExpressao(expressao.esquerda, caminho, conhecidas, problemas, false);
      conferirExpressao(expressao.direita, caminho, conhecidas, problemas, false);
      break;

    case 'oposto':
      conferirExpressao(expressao.valor, caminho, conhecidas, problemas, false);
      break;
  }
}

function contar(quantos: number, singular: string, plural: string): string {
  return `${quantos} ${quantos === 1 ? singular : plural}`;
}

/**
 * "Você quis dizer…?"
 *
 * Erro de digitacao e o erro mais comum de quem esta comecando, e o mais
 * facil de consertar — desde que alguem diga qual era a palavra.
 */
export function sugerir(errado: string, candidatos: readonly string[]): string | undefined {
  let melhor: string | null = null;
  let menorDistancia = Infinity;
  for (const candidato of candidatos) {
    const distancia = distanciaEntre(errado.toLowerCase(), candidato.toLowerCase());
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = candidato;
    }
  }
  // Longe demais nao e erro de digitacao: e outra coisa. Palpite ruim atrapalha
  // mais do que a falta de palpite.
  const limite = Math.max(2, Math.floor(errado.length / 3));
  return melhor && menorDistancia <= limite ? `Você quis dizer "${melhor}"?` : undefined;
}

/** Distancia de edicao: quantas letras separam duas palavras. */
function distanciaEntre(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(
        linha[j] + 1,
        linha[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = guardado;
    }
  }
  return linha[b.length];
}
