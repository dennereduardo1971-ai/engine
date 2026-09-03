import { useRef } from 'react';
import { type Passo } from '@faisca/dialogo';
import { type Editor } from '../editor.ts';
import { Texto, pararTeclas } from './campos.tsx';

/**
 * O painel de conversa (M10, fatia 3): escrever balões de fala e escolhas
 * sem sair do editor, e ouvir a conversa antes de amarrá-la a uma peça.
 *
 * Mesmo desenho do painel de tela (`Telas.tsx`): lista à esquerda, inspetor
 * do item selecionado embaixo, e o par Baixar/Abrir do arquivo de texto. O
 * que ele tem de diferente é o ensaio — a conversa é a única coisa do editor
 * que só faz sentido quando anda.
 */
export function Conversas({ editor }: { editor: Editor }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const passos = editor.conversa.lista;

  return (
    <section className="painel conversas">
      <h2>
        Conversa
        <small>{passos.length} falas</small>
      </h2>

      <label className="campo">
        <span className="rotulo">Nome da conversa</span>
        <Texto valor={editor.conversa.name} onChange={(valor) => editor.renomearConversa(valor)} />
      </label>

      <div className="linha-de-opcoes">
        <button type="button" onClick={() => editor.addPasso()} title="Escreve mais uma fala no fim">
          + Fala
        </button>
        <button
          type="button"
          onClick={() => editor.ensaiar(editor.passoSelection !== null)}
          title="Ouve a conversa aqui mesmo, a partir da fala selecionada"
        >
          Ensaiar
        </button>
      </div>

      <div className="linha-de-opcoes">
        <button type="button" onClick={() => editor.exportarConversa()} title="Baixa o arquivo .dialogo">
          Baixar
        </button>
        <button type="button" onClick={() => arquivo.current?.click()} title="Abre um arquivo .dialogo">
          Abrir
        </button>
        <input
          ref={arquivo}
          type="file"
          accept=".dialogo,.json,.txt,text/plain"
          hidden
          onChange={async (event) => {
            const escolhido = event.target.files?.[0];
            event.target.value = '';
            if (escolhido) editor.importarConversa(await escolhido.text());
          }}
          {...pararTeclas}
        />
      </div>

      <div
        className="lista"
        onClick={(event) => {
          if (event.target === event.currentTarget) editor.selectPasso(null);
        }}
      >
        {passos.length === 0 ? (
          <p className="vazio">Nenhuma fala ainda. Clique em "+ Fala" para começar.</p>
        ) : (
          passos.map((passo, indice) => (
            <FalaDaLista key={passo.id} editor={editor} passo={passo} indice={indice} />
          ))
        )}
      </div>

      {editor.selectedPasso ? <FalaInspetor editor={editor} passo={editor.selectedPasso} /> : null}
    </section>
  );
}

function FalaDaLista({ editor, passo, indice }: { editor: Editor; passo: Passo; indice: number }) {
  const selecionado = editor.passoSelection === passo.id;
  const resumo = passo.texto || '(sem texto)';

  return (
    <div
      className={`ramo${selecionado ? ' selecionado' : ''}`}
      onClick={() => editor.selectPasso(passo.id)}
    >
      <span className="icone">{passo.opcoes.length > 0 ? '❓' : indice === 0 ? '▶' : '💬'}</span>
      <span className="nome" title={resumo}>
        {passo.quem ? `${passo.quem}: ${resumo}` : resumo}
      </span>
    </div>
  );
}

function FalaInspetor({ editor, passo }: { editor: Editor; passo: Passo }) {
  const outros = editor.conversa.lista.filter((outro) => outro.id !== passo.id);

  return (
    <div className="inspetor-tela">
      <label className="campo">
        <span className="rotulo">Quem fala</span>
        <Texto
          valor={passo.quem}
          placeholder="(narrador)"
          onChange={(valor) => editor.setPassoFala(valor, passo.texto)}
        />
      </label>

      <label className="campo">
        <span className="rotulo">Fala</span>
        <Texto valor={passo.texto} onChange={(valor) => editor.setPassoFala(passo.quem, valor)} />
      </label>

      {/*
        Com escolhas, "depois desta fala" some: quem escolhe é quem joga, e
        mostrar os dois campos ao mesmo tempo faria a interface prometer um
        caminho que a máquina de conversa nunca vai seguir.
      */}
      {passo.opcoes.length > 0 ? null : (
        <label className="campo">
          <span className="rotulo">Depois desta fala</span>
          <select
            value={passo.proxima ?? ''}
            onChange={(event) => editor.setPassoProxima(event.target.value || null)}
            {...pararTeclas}
          >
            <option value="">(termina a conversa)</option>
            {outros.map((outro) => (
              <option key={outro.id} value={outro.id}>
                {outro.texto || outro.id}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="escolhas">
        {passo.opcoes.map((opcao, indice) => (
          <div className="linha-de-opcoes" key={indice}>
            <Texto
              valor={opcao.texto}
              onChange={(valor) => editor.setOpcao(indice, valor, opcao.destino)}
            />
            <select
              value={opcao.destino ?? ''}
              onChange={(event) => editor.setOpcao(indice, opcao.texto, event.target.value || null)}
              {...pararTeclas}
            >
              <option value="">(termina)</option>
              {outros.map((outro) => (
                <option key={outro.id} value={outro.id}>
                  {outro.texto || outro.id}
                </option>
              ))}
            </select>
            <button type="button" className="link" onClick={() => editor.removeOpcao(indice)}>
              tirar
            </button>
          </div>
        ))}
      </div>

      <div className="linha-de-opcoes">
        <button type="button" onClick={() => editor.addOpcao()} title="Transforma esta fala numa pergunta">
          + Escolha
        </button>
        <button type="button" className="link" onClick={() => editor.removePassoSelection()}>
          remover
        </button>
      </div>
    </div>
  );
}

/**
 * O balão de fala por cima do palco, durante o ensaio.
 *
 * Ele mora no editor e não no `@faisca/dialogo` de propósito: o pacote diz
 * *o que está sendo dito*, e desenhar isso é decisão de quem mostra. O jogo
 * publicado vai desenhar o mesmo balão com a tela da M9, e não com este JSX.
 */
export function BalaoDaConversa({ editor }: { editor: Editor }) {
  const balao = editor.balao;
  if (!balao) return null;

  return (
    <div className="balao">
      {balao.quem ? <b className="quem">{balao.quem}</b> : null}
      <p className="fala">{balao.texto}</p>
      {balao.opcoes.length > 0 ? (
        <div className="escolhas">
          {balao.opcoes.map((opcao, indice) => (
            <button key={indice} type="button" onClick={() => editor.escolherOpcao(indice)}>
              {opcao}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => editor.avancarConversa()}>
          Continuar
        </button>
      )}
      <button type="button" className="link" onClick={() => editor.pararConversa()}>
        parar o ensaio
      </button>
    </div>
  );
}
