import {
  acharBloco,
  acharEvento,
  BLOCOS,
  EVENTOS,
  moverAcao,
  pedacos,
  porAcao,
  porRegra,
  regrasDe,
  tirar,
  trocarEvento,
  trocarValor,
  type AcaoDeRegra,
  type Categoria,
  type Parametro,
  type Regra as RegraDaArvore,
  type Script,
  type ValorDeRegra,
} from '@faisca/blocos';
import { SONS } from '@faisca/runtime';
import { type SceneNode } from '@faisca/autoria';
import { type Editor } from '../editor.ts';
import { pararTeclas } from './campos.tsx';

/**
 * Gatilho e resposta — o coracao do perfil Design (secoes 7 e 8 do plano).
 *
 * Aqui nao se digita nada que possa dar errado. Evento, acao, peca e som saem
 * de listas; numero e texto sao os unicos campos livres, e um numero errado
 * nao quebra a fase, so faz a mola atirar mais longe.
 *
 * O painel nao guarda estado proprio: ele le a arvore da peca a cada desenho e
 * devolve uma arvore nova a cada mexida. Isso e o que faz o desfazer, o
 * salvamento automatico e as outras duas visoes continuarem valendo sem que
 * este arquivo saiba que elas existem — e o que impede a tela de regras de
 * virar, na surdina, um segundo formato.
 */
export function Regras({ editor, node }: { editor: Editor; node: SceneNode }) {
  const script: Script = node.script ?? { nome: node.name, corpo: [] };
  const vista = regrasDe(script);
  const trocar = (novo: Script): void => editor.setScript(novo);

  // As pecas que uma regra pode apontar. Grupos ficam de fora: eles nao
  // desenham nada, entao mandar um sumir nao faria diferenca nenhuma na tela —
  // e uma opcao que nao faz nada e pior do que uma opcao que falta.
  const pecas = editor.document.nodes
    .filter((candidato) => candidato.piece !== 'grupo')
    .map((candidato) => candidato.name);

  return (
    <div className="conteudo regras">
      {vista.regras.length === 0 ? (
        <p className="vazio">
          Esta peça ainda não faz nada. Uma regra é uma frase: <b>quando</b> alguma coisa
          acontece, <b>faça</b> outra. Escolha o quando aqui embaixo para começar.
        </p>
      ) : null}

      {vista.regras.map((regra) => (
        <Regra
          key={regra.caminho.join('.')}
          regra={regra}
          script={script}
          pecas={pecas}
          trocar={trocar}
        />
      ))}

      <select
        className="gaveta"
        value=""
        onChange={(event) => {
          if (!event.target.value) return;
          trocar(porRegra(script, event.target.value));
          event.target.value = '';
        }}
        {...pararTeclas}
      >
        <option value="">+ nova regra: quando…</option>
        {EVENTOS.map((evento) => (
          <option key={evento.nome} value={evento.nome}>
            {evento.forma}
          </option>
        ))}
      </select>

      {vista.escondidas > 0 ? (
        <p className="escondido">
          Esta peça tem {contar(vista.escondidas, 'coisa', 'coisas')} fora das regras. Elas
          continuam valendo no jogo — só não cabem nesta tela. Para vê-las, abra a peça no
          perfil Criador.
        </p>
      ) : null}
    </div>
  );
}

function Regra({
  regra,
  script,
  pecas,
  trocar,
}: {
  regra: RegraDaArvore;
  script: Script;
  pecas: string[];
  trocar: (script: Script) => void;
}) {
  const evento = acharEvento(regra.evento);

  return (
    <div className="regra">
      <div className="quando">
        <select
          value={regra.evento}
          title={evento?.ajuda}
          onChange={(event) => trocar(trocarEvento(script, regra.caminho, event.target.value))}
          {...pararTeclas}
        >
          {EVENTOS.map((candidato) => (
            <option key={candidato.nome} value={candidato.nome}>
              {candidato.forma}
            </option>
          ))}
          {evento ? null : <option value={regra.evento}>quando {regra.evento}</option>}
        </select>
        <button
          className="apagar"
          title="apagar esta regra"
          onClick={() => trocar(tirar(script, regra.caminho))}
        >
          ✕
        </button>
      </div>

      <div className="entao">
        <span className="seta">→</span>
        <div className="respostas">
          {regra.acoes.map((acao) => (
            <Acao
              key={acao.caminho.join('.')}
              acao={acao}
              script={script}
              pecas={pecas}
              trocar={trocar}
            />
          ))}

          <select
            className="gaveta"
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              trocar(porAcao(script, regra.caminho, event.target.value));
              event.target.value = '';
            }}
            {...pararTeclas}
          >
            <option value="">+ faça…</option>
            {(['cena', 'jogo', 'movimento'] as Categoria[]).map((categoria) => (
              <optgroup key={categoria} label={rotuloDaCategoria(categoria)}>
                {BLOCOS.filter(
                  (bloco) => bloco.categoria === categoria && bloco.devolve === null,
                ).map((bloco) => (
                  <option key={bloco.nome} value={bloco.nome}>
                    {bloco.forma.replace(/\{[^}]+\}/g, '…')}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {regra.escondidas > 0 ? (
            <p className="escondido">
              Mais {contar(regra.escondidas, 'ação que só aparece', 'ações que só aparecem')} em
              blocos.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Acao({
  acao,
  script,
  pecas,
  trocar,
}: {
  acao: AcaoDeRegra;
  script: Script;
  pecas: string[];
  trocar: (script: Script) => void;
}) {
  const definicao = acharBloco(acao.bloco);
  const forma = definicao ? definicao.forma : `${acao.bloco} {…}`;
  let buraco = 0;

  const escrever = (indice: number, valor: ValorDeRegra): void =>
    trocar(trocarValor(script, acao.caminho, indice, valor));

  return (
    <div className="resposta" title={definicao?.ajuda}>
      <span className="texto">
        {pedacos(forma).map((pedaco, i) =>
          pedaco.tipo === 'palavra' ? (
            <span className="palavra" key={i}>
              {pedaco.texto}
            </span>
          ) : (
            <Buraco
              key={i}
              parametro={definicao?.parametros[buraco]}
              valor={acao.argumentos[buraco]}
              indice={buraco++}
              pecas={pecas}
              escrever={escrever}
            />
          ),
        )}
      </span>
      <span className="botoes">
        <button title="subir" onClick={() => trocar(moverAcao(script, acao.caminho, -1))}>
          ↑
        </button>
        <button title="descer" onClick={() => trocar(moverAcao(script, acao.caminho, 1))}>
          ↓
        </button>
        <button title="apagar" onClick={() => trocar(tirar(script, acao.caminho))}>
          ✕
        </button>
      </span>
    </div>
  );
}

/**
 * Um buraco da acao.
 *
 * O tipo do parametro decide o que aparece — e e ai que "peca" e "som" pagam
 * por existir no catalogo: eles sao texto por baixo, mas viram lista aqui, e e
 * a lista que faz esta tela ser montavel sem digitar nada.
 */
function Buraco({
  parametro,
  valor,
  indice,
  pecas,
  escrever,
}: {
  parametro: Parametro | undefined;
  valor: ValorDeRegra | undefined;
  indice: number;
  pecas: string[];
  escrever: (indice: number, valor: ValorDeRegra) => void;
}) {
  const tipo = parametro?.tipo ?? 'texto';

  if (tipo === 'peca') {
    const atual = typeof valor === 'string' ? valor : '';
    // Uma peca apagada continua na lista, marcada: sem isso, a regra apontaria
    // para o nada e a tela mostraria "escolha uma peça", como se a pessoa
    // nunca tivesse escolhido.
    const sumiu = atual !== '' && !pecas.includes(atual);
    return (
      <select
        className={`valor peca${sumiu ? ' faltando' : ''}`}
        value={atual}
        onChange={(event) => escrever(indice, event.target.value)}
        {...pararTeclas}
      >
        <option value="">escolha uma peça</option>
        {pecas.map((nome) => (
          <option key={nome} value={nome}>
            {nome}
          </option>
        ))}
        {sumiu ? <option value={atual}>{atual} (não existe mais)</option> : null}
      </select>
    );
  }

  if (tipo === 'som') {
    return (
      <select
        className="valor som"
        value={typeof valor === 'string' ? valor : ''}
        onChange={(event) => escrever(indice, event.target.value)}
        {...pararTeclas}
      >
        {SONS.map((som) => (
          <option key={som} value={som}>
            {som}
          </option>
        ))}
      </select>
    );
  }

  if (tipo === 'booleano') {
    const ligado = valor === true;
    return (
      <button className="valor booleano" onClick={() => escrever(indice, !ligado)}>
        {ligado ? 'sim' : 'não'}
      </button>
    );
  }

  if (tipo === 'numero') {
    return (
      <input
        className="valor numero"
        type="number"
        value={typeof valor === 'number' ? valor : 0}
        onChange={(event) => {
          const numero = Number(event.target.value);
          if (Number.isFinite(numero)) escrever(indice, numero);
        }}
        {...pararTeclas}
      />
    );
  }

  return (
    <input
      className="valor texto-curto"
      value={typeof valor === 'string' ? valor : String(valor ?? '')}
      onChange={(event) => escrever(indice, event.target.value)}
      {...pararTeclas}
    />
  );
}

function rotuloDaCategoria(categoria: Categoria): string {
  switch (categoria) {
    case 'cena':
      return 'Outras peças';
    case 'jogo':
      return 'Jogo';
    case 'movimento':
      return 'Movimento';
    default:
      return 'Valores';
  }
}

function contar(quantos: number, singular: string, plural: string): string {
  return `${quantos} ${quantos === 1 ? singular : plural}`;
}
