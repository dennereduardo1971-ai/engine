import { pieceOrPlaceholder, type SceneNode } from '@faisca/autoria';
import { type Editor } from '../editor.ts';

/**
 * A arvore de cena — a fase vista como a secao 6 do plano desenha: uma arvore
 * de objetos com nome, e nao uma tabela de entidades. Por baixo continua sendo
 * ECS; e essa a ideia.
 */
export function Arvore({ editor }: { editor: Editor }) {
  const raizes = editor.document.children(null);

  return (
    <section className="painel arvore">
      <h2>
        Cena
        <small>{editor.document.count} peças</small>
      </h2>
      <div className="lista" onClick={(event) => {
        if (event.target === event.currentTarget) editor.select(null);
      }}>
        {raizes.length === 0 ? (
          <p className="vazio">A fase está vazia. Escolha uma peça ao lado e clique no chão.</p>
        ) : (
          raizes.map((node) => <Ramo key={node.id} editor={editor} node={node} nivel={0} />)
        )}
      </div>
    </section>
  );
}

function Ramo({ editor, node, nivel }: { editor: Editor; node: SceneNode; nivel: number }) {
  const filhos = editor.document.children(node.id);
  const piece = pieceOrPlaceholder(node.piece);
  const selecionado = editor.selection === node.id;

  return (
    <>
      <div
        className={`ramo${selecionado ? ' selecionado' : ''}${node.visible ? '' : ' oculto'}`}
        style={{ paddingLeft: `${6 + nivel * 14}px` }}
        onClick={() => editor.select(node.id)}
      >
        <span className="icone">{piece.icon}</span>
        <span className="nome" title={piece.label}>
          {node.name}
        </span>
        {filhos.length > 0 ? <span className="conta">{filhos.length}</span> : null}
        <button
          type="button"
          className="olho"
          title={node.visible ? 'Esconder' : 'Mostrar'}
          onClick={(event) => {
            event.stopPropagation();
            editor.select(node.id);
            editor.setVisible(!node.visible);
          }}
        >
          {node.visible ? '👁' : '🚫'}
        </button>
      </div>
      {filhos.map((filho) => (
        <Ramo key={filho.id} editor={editor} node={filho} nivel={nivel + 1} />
      ))}
    </>
  );
}
