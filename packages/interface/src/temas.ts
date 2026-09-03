/**
 * Temas prontos — a tela inteira troca de roupa numa escolha só.
 *
 * A seção 10 do plano pede um "editor de interface por arrastar, **com temas
 * prontos**". A parte de arrastar veio na fatia 2; os temas são isto. A ideia
 * é a mesma do resto do editor: a mãe não escolhe `0x3f4c70`, ela escolhe
 * "Noite" — e todo botão da tela vira azul-escuro de uma vez.
 *
 * Um tema é uma tabela por **tipo** de elemento (`ElementKind`), e não por nó:
 * assim ele vale para a tela que já existe e para o próximo elemento que
 * alguém arrastar. Cada entrada diz a cor e, quando faz sentido, campos
 * (`raio`, `fontSize`, `opacidade`).
 *
 * `aplicarTema` é pura no sentido que importa aqui: só chama `setCor` e
 * `setFields` do documento, que já emitem os eventos que o `UiRenderer`
 * escuta. Não há DOM aqui, e dá para testar sem janela.
 */

import { elementoOuPlaceholder, type ElementKind } from './elementos.ts';
import { type UiDocument } from './documento.ts';

/** O que um tema diz sobre um tipo de elemento. */
export interface EstiloDoTipo {
  cor: number;
  fields?: Record<string, number>;
}

export interface Tema {
  id: string;
  /** Nome na interface, em português (seção 6). */
  label: string;
  hint: string;
  /** Uma cor por tipo de elemento. Tipo que falta fica como está. */
  estilos: Partial<Record<ElementKind, EstiloDoTipo>>;
}

export const TEMAS: readonly Tema[] = [
  {
    id: 'noite',
    label: 'Noite',
    hint: 'Fundo escuro, letra branca — o padrão de fábrica da Faísca.',
    estilos: {
      texto: { cor: 0xffffff, fields: { fontSize: 24 } },
      botao: { cor: 0x3f4c70, fields: { raio: 8, fontSize: 20 } },
      imagem: { cor: 0xffffff, fields: { opacidade: 1 } },
      barra: { cor: 0x4ade80, fields: { raio: 4 } },
      painel: { cor: 0x1a1f2e, fields: { opacidade: 0.8, raio: 12 } },
    },
  },
  {
    id: 'papel',
    label: 'Papel',
    hint: 'Claro e calmo, como um caderno — bom para menu e tela de ajuda.',
    estilos: {
      texto: { cor: 0x2b2b2b, fields: { fontSize: 24 } },
      botao: { cor: 0xe8e2d4, fields: { raio: 10, fontSize: 20 } },
      imagem: { cor: 0xfaf7ef, fields: { opacidade: 1 } },
      barra: { cor: 0xd98a3c, fields: { raio: 6 } },
      painel: { cor: 0xfaf7ef, fields: { opacidade: 0.94, raio: 14 } },
    },
  },
  {
    id: 'doce',
    label: 'Doce',
    hint: 'Rosa e roxo, cantos bem redondos — cara de jogo de criança.',
    estilos: {
      texto: { cor: 0x5b2a5e, fields: { fontSize: 26 } },
      botao: { cor: 0xf06fae, fields: { raio: 20, fontSize: 22 } },
      imagem: { cor: 0xffffff, fields: { opacidade: 1 } },
      barra: { cor: 0xf7c948, fields: { raio: 12 } },
      painel: { cor: 0xffe3f2, fields: { opacidade: 0.9, raio: 24 } },
    },
  },
  {
    id: 'arcade',
    label: 'Arcade',
    hint: 'Preto com neon e canto reto — jeito de fliperama antigo.',
    estilos: {
      texto: { cor: 0x39ff14, fields: { fontSize: 22 } },
      botao: { cor: 0x111318, fields: { raio: 0, fontSize: 20 } },
      imagem: { cor: 0xffffff, fields: { opacidade: 1 } },
      barra: { cor: 0x00e5ff, fields: { raio: 0 } },
      painel: { cor: 0x000000, fields: { opacidade: 0.72, raio: 0 } },
    },
  },
];

const BY_ID = new Map(TEMAS.map((tema) => [tema.id, tema]));

export function findTema(id: string): Tema | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Pinta a tela inteira com um tema. Devolve quantos nós mudaram.
 *
 * Nó de elemento que o tema não conhece (um elemento novo, ou o placeholder
 * roxo de um arquivo mais novo) fica exatamente como estava: um tema que não
 * fala daquele tipo não é motivo para apagar a cor que a pessoa escolheu.
 */
export function aplicarTema(documento: UiDocument, tema: Tema): number {
  let mudados = 0;
  for (const node of documento.nodes) {
    const estilo = tema.estilos[elementoOuPlaceholder(node.elemento).kind];
    if (!estilo) continue;
    documento.setCor(node.id, estilo.cor);
    if (estilo.fields) documento.setFields(node.id, estilo.fields);
    mudados += 1;
  }
  return mudados;
}
