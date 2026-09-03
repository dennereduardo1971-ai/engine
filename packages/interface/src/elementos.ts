/**
 * Elementos de interface — a paleta de blocos com que uma tela e montada.
 *
 * A secao 10 do plano descreve o kit "HUD e menus" como um "editor de
 * interface por arrastar, com temas prontos". Antes de arrastar qualquer
 * coisa, precisa existir um catalogo do que da para colocar numa tela — igual
 * `pecas.ts` faz para a cena 3D, mas aqui cada item e um elemento de tela 2D
 * (texto, botao, imagem, barra, painel), e nao uma malha.
 *
 * Um elemento e so uma descricao, com os valores de fabrica dele. Quem
 * transforma isso num no de verdade e o `UiDocument` (`documento.ts`).
 */

export type ElementKind = 'texto' | 'botao' | 'imagem' | 'barra' | 'painel';

export interface Elemento {
  id: string;
  /** Nome na interface, em portugues (secao 6). */
  label: string;
  icon: string;
  kind: ElementKind;
  /** Uma linha de ajuda no painel de elementos. */
  hint: string;
  /** Rotulo de fabrica. So faz sentido para texto e botao. */
  texto: string | null;
  largura: number;
  altura: number;
  cor: number;
  /** Valores de fabrica dos campos do elemento (fontSize, opacidade, etc). */
  fields: Record<string, number>;
}

export const ELEMENTOS: readonly Elemento[] = [
  {
    id: 'texto',
    label: 'Texto',
    icon: '🔤',
    kind: 'texto',
    hint: 'Uma linha de texto na tela — pontuacao, aviso, titulo.',
    texto: 'Texto',
    largura: 160,
    altura: 32,
    cor: 0xffffff,
    fields: { fontSize: 24 },
  },
  {
    id: 'botao',
    label: 'Botão',
    icon: '🔘',
    kind: 'botao',
    hint: 'Clicavel. E o "aqui" de "quando o botao for clicado".',
    texto: 'Botão',
    largura: 160,
    altura: 48,
    cor: 0x3f4c70,
    fields: { fontSize: 20, raio: 8 },
  },
  {
    id: 'imagem',
    label: 'Imagem',
    icon: '🖼️',
    kind: 'imagem',
    hint: 'Um retangulo com uma figura dentro.',
    texto: null,
    largura: 96,
    altura: 96,
    cor: 0xffffff,
    fields: { opacidade: 1 },
  },
  {
    id: 'barra',
    label: 'Barra',
    icon: '📊',
    kind: 'barra',
    hint: 'Barra de progresso — vida, tempo, carregamento.',
    texto: null,
    largura: 200,
    altura: 20,
    cor: 0x4ade80,
    fields: { valor: 1, raio: 4 },
  },
  {
    id: 'painel',
    label: 'Painel',
    icon: '🗂️',
    kind: 'painel',
    hint: 'Um retangulo de fundo para agrupar outros elementos.',
    texto: null,
    largura: 240,
    altura: 160,
    cor: 0x1a1f2e,
    fields: { opacidade: 0.8, raio: 12 },
  },
];

const BY_ID = new Map(ELEMENTOS.map((elemento) => [elemento.id, elemento]));

export function findElemento(id: string): Elemento | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Elemento desconhecido (arquivo de uma versao mais nova, elemento
 * renomeado): em vez de perder o no, ele vira um painel roxo com o nome do
 * elemento que faltou — mesma ideia de `pieceOrPlaceholder` em `pecas.ts`.
 */
export function elementoOuPlaceholder(id: string): Elemento {
  return (
    BY_ID.get(id) ?? {
      id,
      label: `Elemento desconhecido (${id})`,
      icon: '❓',
      kind: 'painel',
      hint: 'Este elemento não existe nesta versão da Faísca.',
      texto: null,
      largura: 120,
      altura: 60,
      cor: 0xb45cf0,
      fields: {},
    }
  );
}
