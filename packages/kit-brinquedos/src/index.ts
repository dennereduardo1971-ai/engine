/**
 * Kit Fisica-brinquedo.
 *
 * A secao 10 do plano lista o kit inteiro: caixas que quebram, objetos que
 * empurram e empilham, alavancas, portas, plataformas moveis, esteiras e
 * veiculos simples. A porta e o primeiro — ela entra junto com as regras de
 * gatilho-e-resposta da M6, porque e ela que da o "→ abre a porta" da frase
 * que a secao 7 usa para explicar o que uma regra e.
 */
export {
  mandarPorta,
  Porta,
  portaAberta,
  portaSystem,
  resetPortas,
} from './porta.ts';
