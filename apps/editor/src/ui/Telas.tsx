import { useRef } from 'react';
import { elementoOuPlaceholder, ELEMENTOS, TEMAS, type Ancora, type UiNode } from '@faisca/interface';
import { FONTES_VIVAS, fonteVivaValida, type Editor } from '../editor.ts';
import { Numero, Texto, pararTeclas } from './campos.tsx';

const ANCORAS: { id: Ancora; titulo: string }[] = [
  { id: 'topo-esquerda', titulo: 'topo-esquerda' },
  { id: 'topo', titulo: 'topo' },
  { id: 'topo-direita', titulo: 'topo-direita' },
  { id: 'esquerda', titulo: 'esquerda' },
  { id: 'centro', titulo: 'centro' },
  { id: 'direita', titulo: 'direita' },
  { id: 'baixo-esquerda', titulo: 'baixo-esquerda' },
  { id: 'baixo', titulo: 'baixo' },
  { id: 'baixo-direita', titulo: 'baixo-direita' },
];

/**
 * O painel da tela de interface (M9, fatia 2): montar um HUD ou menu
 * escolhendo elementos do catálogo e arrastando-os por âncora, em vez de
 * escrever HTML à mão como o kit-velocidade faz hoje.
 *
 * Mesmo miolo da árvore de cena (`Arvore.tsx`) e do pincel de peças
 * (`Pecas.tsx`), aplicado a `editor.tela` em vez de `editor.document` — e
 * sem desfazer, decisão que já vem da fatia 1 do documento `.ui`.
 */
export function Telas({ editor }: { editor: Editor }) {
  const arquivo = useRef<HTMLInputElement>(null);

  return (
    <section className="painel telas">
      <h2>
        Tela
        <small>{editor.tela.count} elementos</small>
      </h2>

      <label className="campo">
        <span className="rotulo">Nome da tela</span>
        <Texto valor={editor.tela.name} onChange={(valor) => editor.renomearTela(valor)} />
      </label>

      {/*
        Tema: a escolha não fica "grudada" na tela — aplicar é uma ação, não um
        estado. Por isso o `select` volta para "Trocar o visual…" depois de
        pintar: quem mexeu na cor de um botão sozinho depois não vê a interface
        mentindo que a tela inteira ainda é "Noite".
      */}
      <label className="campo">
        <span className="rotulo">Tema</span>
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) editor.aplicarTemaNaTela(event.target.value);
          }}
          {...pararTeclas}
        >
          <option value="">Trocar o visual…</option>
          {TEMAS.map((tema) => (
            <option key={tema.id} value={tema.id} title={tema.hint}>
              {tema.label}
            </option>
          ))}
        </select>
      </label>

      <div className="linha-de-opcoes">
        <button type="button" onClick={() => editor.exportarTela()} title="Baixa o arquivo .ui">
          Baixar
        </button>
        <button type="button" onClick={() => arquivo.current?.click()} title="Abre um arquivo .ui">
          Abrir
        </button>
        <input
          ref={arquivo}
          type="file"
          accept=".ui,.json,.txt,text/plain"
          hidden
          onChange={async (event) => {
            const escolhido = event.target.files?.[0];
            event.target.value = '';
            if (escolhido) editor.importarTela(await escolhido.text());
          }}
          {...pararTeclas}
        />
      </div>

      <div className="grade-de-pecas">
        {ELEMENTOS.map((elemento) => (
          <button
            key={elemento.id}
            type="button"
            className="peca"
            title={elemento.hint}
            onClick={() => editor.addElemento(elemento.id)}
          >
            <span className="icone">{elemento.icon}</span>
            <span className="nome">{elemento.label}</span>
          </button>
        ))}
      </div>

      <div
        className="lista"
        onClick={(event) => {
          if (event.target === event.currentTarget) editor.selectTela(null);
        }}
      >
        {editor.tela.nodes.length === 0 ? (
          <p className="vazio">A tela está vazia. Escolha um elemento acima para começar.</p>
        ) : (
          editor.tela.nodes.map((node) => <NoDaTela key={node.id} editor={editor} node={node} />)
        )}
      </div>

      {editor.selectedTelaNode ? <TelaInspetor editor={editor} node={editor.selectedTelaNode} /> : null}
    </section>
  );
}

function NoDaTela({ editor, node }: { editor: Editor; node: UiNode }) {
  const elemento = elementoOuPlaceholder(node.elemento);
  const selecionado = editor.telaSelection === node.id;

  return (
    <div
      className={`ramo${selecionado ? ' selecionado' : ''}`}
      onClick={() => editor.selectTela(node.id)}
    >
      <span className="icone">{elemento.icon}</span>
      <span className="nome" title={elemento.label}>
        {node.name}
      </span>
    </div>
  );
}

function TelaInspetor({ editor, node }: { editor: Editor; node: UiNode }) {
  const elemento = elementoOuPlaceholder(node.elemento);

  return (
    <div className="inspetor-tela">
      <label className="campo">
        <span className="rotulo">Nome</span>
        <Texto valor={node.name} onChange={(valor) => editor.renameTela(valor)} />
      </label>

      <label className="campo">
        <span className="rotulo">Âncora</span>
        <select
          value={node.ancora}
          onChange={(event) => editor.setTelaAncora(event.target.value as Ancora)}
          {...pararTeclas}
        >
          {ANCORAS.map((ancora) => (
            <option key={ancora.id} value={ancora.id}>
              {ancora.titulo}
            </option>
          ))}
        </select>
      </label>

      <div className="linha-de-opcoes">
        <label title="Deslocamento a partir da âncora, em pixels.">
          <span>X</span>
          <Numero
            valor={node.offsetX}
            step={1}
            onChange={(valor) => editor.setTelaOffset(valor, node.offsetY)}
          />
        </label>
        <label>
          <span>Y</span>
          <Numero
            valor={node.offsetY}
            step={1}
            onChange={(valor) => editor.setTelaOffset(node.offsetX, valor)}
          />
        </label>
      </div>

      {elemento.texto === null ? null : (
        <label className="campo">
          <span className="rotulo">Texto</span>
          <Texto
            valor={node.texto ?? elemento.texto}
            placeholder={elemento.texto}
            onChange={(valor) => editor.setTelaTexto(valor)}
          />
        </label>
      )}

      {/*
        Só barra tem "valor vivo": é o único elemento cujo campo principal é um
        número de 0 a 1, que é o que as fontes do jogo entregam. Um texto que
        mostrasse a contagem de anéis precisaria de outra coisa (texto, não
        número), e isso não é desta fatia.
      */}
      {elemento.kind !== 'barra' ? null : (
        <label className="campo" title="A barra acompanha sozinha este valor do jogo, a cada quadro.">
          <span className="rotulo">Valor vivo</span>
          <select
            value={editor.campoVivoDe(node.id) ?? ''}
            onChange={(event) => {
              const escolhido = event.target.value;
              editor.setCampoVivo(node.id, fonteVivaValida(escolhido) ? escolhido : null);
            }}
            {...pararTeclas}
          >
            <option value="">(nenhum)</option>
            {FONTES_VIVAS.map((fonte) => (
              <option key={fonte.id} value={fonte.id}>
                {fonte.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="campo">
        <span className="rotulo">Cor</span>
        <span className="cor">
          <input
            type="color"
            value={`#${(node.cor ?? elemento.cor).toString(16).padStart(6, '0')}`}
            onChange={(event) => editor.setTelaCor(Number.parseInt(event.target.value.slice(1), 16))}
            {...pararTeclas}
          />
          {node.cor === null ? null : (
            <button type="button" className="link" onClick={() => editor.setTelaCor(null)}>
              voltar à cor do elemento
            </button>
          )}
        </span>
      </label>

      <button type="button" className="link" onClick={() => editor.removeTelaSelection()}>
        remover
      </button>
    </div>
  );
}
