import { type Editor } from '../editor.ts';

/**
 * A ferramenta Pista: a spline de pista da secao 9 do plano (a M7), e o
 * carro-chefe das tres ferramentas de construcao de fase.
 *
 * Clicar em "Pista" arma o rascunho; cada clique no chao poe um ponto; a
 * linha aparece na hora (o viewport desenha o rascunho). "Concluir" transforma
 * isso numa peca de verdade — largura e inclinacao ficam no valor de fabrica
 * por enquanto, e ajustar cada ponto e uma fatia futura.
 */
export function Pista({ editor }: { editor: Editor }) {
  const desenhando = editor.splineDraft !== null;
  const pontos = editor.splineDraft?.length ?? 0;

  return (
    <section className="painel pista-spline">
      <h2>Pista</h2>
      {desenhando ? (
        <>
          <p className="dica-do-pincel">
            Clique no chão para adicionar pontos.{' '}
            {pontos === 0 ? 'Ainda sem pontos.' : `${pontos} ponto${pontos > 1 ? 's' : ''}.`}
          </p>
          <div className="pista-botoes">
            <button type="button" disabled={pontos === 0} onClick={() => editor.undoSplinePoint()}>
              Desfazer ponto
            </button>
            <button type="button" disabled={pontos < 2} onClick={() => editor.finishSpline()}>
              Concluir
            </button>
            <button type="button" className="perigo" onClick={() => editor.cancelSpline()}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => editor.beginSpline()}>
          🛣️ Desenhar uma pista
        </button>
      )}
    </section>
  );
}
