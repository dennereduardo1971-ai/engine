/**
 * O renderizador — leva um `UiDocument` para elementos DOM de verdade.
 *
 * Fatia 3 da M9: o sistema que a fatia 1 deixou para depois ("um sistema no
 * runtime que sincroniza `UiDocument` com elementos DOM de verdade"). Ele não
 * mora em `@faisca/runtime`: a sincronização é dirigida pelos eventos que o
 * próprio `UiDocument.on` já emite (fatia 1), não por um laço a cada quadro —
 * então `@faisca/interface` não precisa depender do runtime para isto.
 * Campo com valor vivo a cada quadro (ex.: uma "barra" amarrada à vida do
 * personagem) tem casa própria em `vivo.ts`: a tabela de ligações mora lá, e
 * quem chama `atualizar()` num sistema de fase 'render' é quem já depende do
 * runtime (o editor, um kit). Aqui continua valendo que toda mudança de campo
 * chega por um evento do documento, e cada evento atualiza só o elemento certo.
 *
 * As funções puras (`calcularPosicao`, `calcularAparencia`) são o que dá para
 * testar sem uma janela de verdade: o resto, a classe `UiRenderer`, mexe em
 * `document`/DOM direto, no mesmo espírito de `GameHud` — que também não tem
 * teste unitário por isso.
 */

import { type Ancora, type UiChange, type UiDocument, type UiNode } from './documento.ts';
import { elementoOuPlaceholder, type Elemento } from './elementos.ts';

/** Onde, em cada eixo, a âncora prende o nó. */
const EIXOS: Record<Ancora, { vert: 'topo' | 'centro' | 'baixo'; horiz: 'esquerda' | 'centro' | 'direita' }> = {
  'topo-esquerda': { vert: 'topo', horiz: 'esquerda' },
  topo: { vert: 'topo', horiz: 'centro' },
  'topo-direita': { vert: 'topo', horiz: 'direita' },
  esquerda: { vert: 'centro', horiz: 'esquerda' },
  centro: { vert: 'centro', horiz: 'centro' },
  direita: { vert: 'centro', horiz: 'direita' },
  'baixo-esquerda': { vert: 'baixo', horiz: 'esquerda' },
  baixo: { vert: 'baixo', horiz: 'centro' },
  'baixo-direita': { vert: 'baixo', horiz: 'direita' },
};

/**
 * Posição e tamanho de um nó, como propriedades CSS — a parte que é sempre a
 * mesma, elemento desconhecido incluído, porque só depende da âncora.
 *
 * Uma tela precisa ser responsiva: por isso o ponto de prendedor é uma borda
 * ou canto (`top`/`left`/`right`/`bottom`), e não um pixel absoluto — o
 * `offsetX`/`offsetY` do nó desloca a partir dali, nunca do canto da janela.
 */
export function calcularPosicao(node: UiNode, elemento: Elemento): Record<string, string> {
  const eixo = EIXOS[node.ancora];
  const largura = node.largura ?? elemento.largura;
  const altura = node.altura ?? elemento.altura;
  const transformos: string[] = [];
  const estilo: Record<string, string> = {
    position: 'absolute',
    width: `${largura}px`,
    height: `${altura}px`,
  };

  if (eixo.vert === 'topo') estilo.top = `${node.offsetY}px`;
  else if (eixo.vert === 'baixo') estilo.bottom = `${node.offsetY}px`;
  else {
    estilo.top = `calc(50% + ${node.offsetY}px)`;
    transformos.push('translateY(-50%)');
  }

  if (eixo.horiz === 'esquerda') estilo.left = `${node.offsetX}px`;
  else if (eixo.horiz === 'direita') estilo.right = `${node.offsetX}px`;
  else {
    estilo.left = `calc(50% + ${node.offsetX}px)`;
    transformos.push('translateX(-50%)');
  }

  if (transformos.length > 0) estilo.transform = transformos.join(' ');
  return estilo;
}

/** `0x3f4c70` → `"#3f4c70"`. */
function paraHex(cor: number): string {
  return `#${cor.toString(16).padStart(6, '0')}`;
}

/**
 * Cor, borda e fonte de um nó — a parte que depende do tipo do elemento
 * (texto tem cor de fonte, painel tem cor de fundo e opacidade, etc).
 */
export function calcularAparencia(node: UiNode, elemento: Elemento): Record<string, string> {
  const cor = paraHex(node.cor ?? elemento.cor);
  const fontSize = node.fields.fontSize ?? elemento.fields.fontSize ?? 16;
  const raio = node.fields.raio ?? elemento.fields.raio ?? 0;
  const opacidade = node.fields.opacidade ?? elemento.fields.opacidade ?? 1;

  const base: Record<string, string> = {
    boxSizing: 'border-box',
    fontSize: `${fontSize}px`,
    borderRadius: `${raio}px`,
    opacity: String(opacidade),
  };

  if (elemento.kind === 'texto') {
    return { ...base, color: cor, background: 'transparent' };
  }
  if (elemento.kind === 'botao' || elemento.kind === 'painel' || elemento.kind === 'imagem') {
    return { ...base, background: cor, color: '#fff' };
  }
  // 'barra': o fundo e claro, o preenchimento (calcularPreenchimento) que leva a cor.
  return { ...base, background: 'rgba(255,255,255,0.16)' };
}

/** Largura do preenchimento de uma barra, de 0 a 100%, a partir do campo `valor`. */
export function calcularPreenchimento(node: UiNode, elemento: Elemento): string {
  const valor = node.fields.valor ?? elemento.fields.valor ?? 1;
  return `${Math.max(0, Math.min(1, valor)) * 100}%`;
}

/** O botão que foi clicado, do jeito que uma regra fala dele. */
export interface Clique {
  id: string;
  /** O nome do nó — é o que a pessoa escreveu no inspetor, e o que a regra lê. */
  nome: string;
}

export type CliqueListener = (clique: Clique) => void;

/**
 * Sincroniza um `UiDocument` com elementos DOM reais dentro de `parent`.
 *
 * Uma tela é sempre por cima do jogo e nunca captura clique — exceto o botão,
 * que é clicável para o gatilho "quando o botão for clicado" (`AoClicar`, no
 * catálogo de `@faisca/blocos`) funcionar.
 */
export class UiRenderer {
  readonly root: HTMLElement;
  private readonly elementos = new Map<string, HTMLElement>();
  private readonly preenchimentos = new Map<string, HTMLElement>();
  private readonly cliques = new Set<CliqueListener>();
  private readonly solta: () => void;

  constructor(
    private readonly documento: UiDocument,
    parent: HTMLElement = document.body,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'faisca-tela';
    Object.assign(this.root.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    parent.append(this.root);
    // Um ouvinte só, na raiz: a tela pode ganhar e perder botões o tempo todo,
    // e um ouvinte por elemento seria um a mais para lembrar de soltar em cada
    // `remove`. Aqui o `dispose` da raiz leva o clique junto.
    this.root.addEventListener('click', this.aoClicar);
    this.solta = documento.on((mudanca) => this.aplicar(mudanca));
    this.reconstruir();
  }

  /** O elemento DOM de um nó — para quem for ligar clique (fatia do botão). */
  elemento(id: string): HTMLElement | null {
    return this.elementos.get(id) ?? null;
  }

  /**
   * Avisa quando um botão da tela é clicado.
   *
   * É este o fio entre a tela montada no editor e o evento `AoClicar` dos
   * blocos: quem tem os scripts vivos (o montador, no `@faisca/autoria`)
   * escuta aqui e dispara o evento. `@faisca/interface` continua sem saber o
   * que é um script — ela só diz *qual botão* foi clicado.
   */
  onClique(listener: CliqueListener): () => void {
    this.cliques.add(listener);
    return () => this.cliques.delete(listener);
  }

  dispose(): void {
    this.solta();
    this.cliques.clear();
    this.root.removeEventListener('click', this.aoClicar);
    this.root.remove();
  }

  private readonly aoClicar = (evento: Event): void => {
    const alvo = evento.target;
    if (!(alvo instanceof HTMLElement)) return;
    const el = alvo.closest<HTMLElement>('[data-id]');
    const id = el?.dataset.id;
    if (!id) return;
    const node = this.documento.get(id);
    // Só botão, e só botão visível: um painel por cima do jogo não é um
    // gatilho, e um botão escondido não deveria disparar nada.
    if (!node || !node.visible) return;
    if (elementoOuPlaceholder(node.elemento).kind !== 'botao') return;
    for (const listener of this.cliques) listener({ id, nome: node.name });
  };

  private aplicar(mudanca: UiChange): void {
    if (mudanca.kind === 'reload') {
      this.reconstruir();
      return;
    }
    if (mudanca.kind === 'add') {
      this.criar(mudanca.id);
      return;
    }
    if (mudanca.kind === 'remove') {
      this.elementos.get(mudanca.id)?.remove();
      this.elementos.delete(mudanca.id);
      this.preenchimentos.delete(mudanca.id);
      return;
    }
    // ancora, fields, appearance, name, texto, parent: uma tela tem dezenas
    // de nós, não milhares — refazer o estilo do nó inteiro é barato, e mais
    // simples do que remendar propriedade por propriedade.
    this.atualizar(mudanca.id);
  }

  private reconstruir(): void {
    this.root.replaceChildren();
    this.elementos.clear();
    this.preenchimentos.clear();
    for (const node of this.documento.nodes) this.criar(node.id);
  }

  private criar(id: string): void {
    const node = this.documento.get(id);
    if (!node) return;
    const el = document.createElement('div');
    el.dataset.id = id;
    this.root.append(el);
    this.elementos.set(id, el);
    this.atualizar(id);
  }

  private atualizar(id: string): void {
    const node = this.documento.get(id);
    const el = this.elementos.get(id);
    if (!node || !el) return;
    const elemento = elementoOuPlaceholder(node.elemento);

    el.style.cssText = '';
    Object.assign(el.style, { position: 'absolute', pointerEvents: elemento.kind === 'botao' ? 'auto' : 'none' });
    Object.assign(el.style, calcularPosicao(node, elemento));
    Object.assign(el.style, calcularAparencia(node, elemento));
    el.hidden = !node.visible;
    el.title = node.name;

    if (elemento.kind === 'barra') {
      let preenchimento = this.preenchimentos.get(id);
      if (!preenchimento) {
        preenchimento = document.createElement('div');
        Object.assign(preenchimento.style, { height: '100%' });
        el.replaceChildren(preenchimento);
        this.preenchimentos.set(id, preenchimento);
      }
      Object.assign(preenchimento.style, {
        width: calcularPreenchimento(node, elemento),
        background: paraHex(node.cor ?? elemento.cor),
        borderRadius: el.style.borderRadius,
      });
      el.textContent = '';
      el.append(preenchimento);
    } else {
      this.preenchimentos.delete(id);
      el.textContent = elemento.texto === null ? '' : (node.texto ?? elemento.texto);
    }
  }
}
