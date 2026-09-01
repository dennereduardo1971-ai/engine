import { useRef } from 'react';
import { acharPerfil, PERFIS, type Perfil } from '@faisca/autoria';
import { type Editor } from '../editor.ts';
import { pararTeclas, Texto } from './campos.tsx';

/**
 * A barra de cima: perfil, arquivo, desfazer e o teste ao vivo.
 *
 * O play, o pause e o passo-a-passo sao a promessa da secao 8 do plano. O que
 * ainda nao esta aqui e o "rebobinar 5 segundos", que precisa de um diario de
 * estado do mundo.
 *
 * O seletor de perfil fica aqui, e nao escondido numa tela de configuracao,
 * porque trocar de perfil e uma coisa que se faz **no meio do trabalho**: o
 * pai abre o editor no Criador, a mae senta na cadeira e passa para o Design,
 * e nenhum dos dois deveria ter que procurar por isso.
 */
export function Barra({ editor }: { editor: Editor }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const jogando = editor.mode === 'jogar';
  const perfil = acharPerfil(editor.perfil);

  return (
    <header className="barra">
      <span className="marca" title="Faísca">
        ⚡
      </span>

      <Texto
        valor={editor.document.name}
        placeholder="Nome da fase"
        onChange={(valor) => editor.renomearCena(valor)}
      />

      <label className="perfil" title={perfil.resumo}>
        <span aria-hidden>{perfil.icone}</span>
        <select
          value={editor.perfil}
          onChange={(event) => editor.setPerfil(event.target.value as Perfil)}
          {...pararTeclas}
        >
          {PERFIS.map((candidato) => (
            <option key={candidato.id} value={candidato.id} disabled={!candidato.disponivel}>
              {candidato.label}
              {candidato.disponivel ? '' : ' (em breve)'}
            </option>
          ))}
        </select>
      </label>

      <div className="botoes">
        <button type="button" onClick={() => editor.novaFase()}>
          Nova
        </button>
        <button type="button" onClick={() => editor.carregarExemplo()}>
          Exemplo
        </button>
        <button type="button" onClick={() => editor.exportar()} title="Baixa o arquivo .cena">
          Baixar
        </button>
        <button type="button" onClick={() => arquivo.current?.click()}>
          Abrir
        </button>
        <input
          ref={arquivo}
          type="file"
          accept=".cena,.json,.txt,text/plain"
          hidden
          onChange={async (event) => {
            const escolhido = event.target.files?.[0];
            event.target.value = '';
            if (escolhido) editor.importar(await escolhido.text());
          }}
          {...pararTeclas}
        />
      </div>

      <div className="botoes">
        <button
          type="button"
          disabled={!editor.history.canUndo}
          title={editor.history.undoLabel ? `Desfazer ${editor.history.undoLabel}` : 'Desfazer'}
          onClick={() => editor.undo()}
        >
          ↶ Desfazer
        </button>
        <button
          type="button"
          disabled={!editor.history.canRedo}
          title={editor.history.redoLabel ? `Refazer ${editor.history.redoLabel}` : 'Refazer'}
          onClick={() => editor.redo()}
        >
          ↷ Refazer
        </button>
      </div>

      <div className="botoes teste">
        {jogando ? (
          <>
            {/* Pausa e passo-a-passo sao ferramenta de quem depura, e nao de
                quem monta uma fase: no perfil Design eles nao aparecem. */}
            {editor.mostra.depuracao ? (
              <>
                <button type="button" onClick={() => editor.togglePause()}>
                  {editor.paused ? '▶ Continuar' : '⏸ Pausar'}
                </button>
                <button
                  type="button"
                  title="Um passo da simulação"
                  onClick={() => editor.stepOnce()}
                >
                  ⏭ Passo
                </button>
              </>
            ) : null}
            <button type="button" className="parar" onClick={() => editor.stop()}>
              ⏹ Parar
            </button>
          </>
        ) : (
          <button type="button" className="jogar" onClick={() => editor.play()}>
            ▶ Jogar
          </button>
        )}
      </div>

      <div className="recado">{editor.message}</div>
    </header>
  );
}
