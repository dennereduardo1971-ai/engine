import { PIECES, type Piece } from '@faisca/autoria';
import { type Editor } from '../editor.ts';
import { Numero, pararTeclas } from './campos.tsx';

/**
 * A paleta de pecas: o pincel de montar fase.
 *
 * Escolher uma peca e clicar no chao coloca uma. E a ferramenta 2 da secao 9
 * do plano — pecas modulares que encaixam numa grade, com giro em angulos
 * fixos. A spline de pista, que e a ferramenta 1, e a M7.
 */
const GRUPOS: { id: Piece['group']; titulo: string }[] = [
  { id: 'jogo', titulo: 'Jogo' },
  { id: 'pista', titulo: 'Pista' },
  { id: 'coletavel', titulo: 'Coletáveis' },
  { id: 'cenario', titulo: 'Cenário' },
];

export function Pecas({ editor }: { editor: Editor }) {
  const escolhida = PIECES.find((piece) => piece.id === editor.brush) ?? null;

  return (
    <section className="painel pecas">
      <h2>Peças</h2>
      {GRUPOS.map((grupo) => (
        <div key={grupo.id} className="grupo-de-pecas">
          <h3>{grupo.titulo}</h3>
          <div className="grade-de-pecas">
            {PIECES.filter((piece) => piece.group === grupo.id).map((piece) => (
              <button
                key={piece.id}
                type="button"
                className="peca"
                title={piece.hint}
                aria-pressed={editor.brush === piece.id}
                onClick={() => editor.setBrush(piece.id)}
              >
                <span className="icone">{piece.icon}</span>
                <span className="nome">{piece.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="dica-do-pincel">
        {escolhida ? (
          <>
            <b>{escolhida.label}</b> na mão: clique no chão para colocar.{' '}
            <button type="button" className="link" onClick={() => editor.setBrush(null)}>
              guardar o pincel
            </button>
          </>
        ) : (
          'Escolha uma peça para começar a colocar. Sem pincel, o clique seleciona.'
        )}
      </div>

      <div className="linha-de-opcoes">
        <label title="As peças novas encaixam de tantas em tantas unidades.">
          <span>Encaixe</span>
          <select
            value={editor.snap ? String(editor.grid) : '0'}
            onChange={(event) => {
              const valor = Number(event.target.value);
              if (valor === 0) {
                if (editor.snap) editor.toggleSnap();
                return;
              }
              if (!editor.snap) editor.toggleSnap();
              editor.setGrid(valor);
            }}
            {...pararTeclas}
          >
            <option value="0">livre</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="4">4</option>
            <option value="8">8</option>
          </select>
        </label>
        <label title="Altura em que a peça nova cai. Serve para montar trecho suspenso.">
          <span>Altura</span>
          <Numero
            valor={editor.workHeight}
            step={0.5}
            onChange={(valor) => editor.setWorkHeight(valor)}
          />
        </label>
      </div>
    </section>
  );
}
