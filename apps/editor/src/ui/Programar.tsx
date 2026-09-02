import { useEffect, useMemo, useState } from 'react';
import {
  acharBloco,
  acharEvento,
  BLOCOS,
  conferir,
  copiar,
  EVENTOS,
  imprimir,
  instrucaoEm,
  ler,
  listaEm,
  pedacos,
  ramos,
  scriptVazio,
  type Caminho,
  type Expressao,
  type Instrucao,
  type Problema,
  type Script,
} from '@faisca/blocos';
import { type Editor } from '../editor.ts';
import { pararTeclas } from './campos.tsx';
import { Regras } from './Regras.tsx';

type Aba = 'regras' | 'blocos' | 'codigo';

/**
 * O painel de programacao — as tres visoes da secao 7, lado a lado no tempo.
 *
 * Nao ha conversao entre elas. A aba "regras" desenha o gatilho-e-resposta, a
 * aba "blocos" desenha a arvore inteira e a aba "codigo" escreve a arvore;
 * trocar de aba nao converte nada, so muda quem esta desenhando. E por isso
 * que editar uma linha de codigo e voltar mostra o bloco ja mudado, e que uma
 * regra montada apontando e clicando aparece como bloco do outro lado.
 *
 * Quais abas existem e o perfil quem decide (secao 8): Design ve so regras,
 * Criador ve regras e blocos, Programador ve as tres.
 */
export function Programar({ editor }: { editor: Editor }) {
  const node = editor.selectedNode;
  const mostra = editor.mostra;
  const abas: Aba[] = [
    ...(mostra.regras ? (['regras'] as const) : []),
    ...(mostra.blocos ? (['blocos'] as const) : []),
    ...(mostra.codigo ? (['codigo'] as const) : []),
  ];
  const [escolhida, setAba] = useState<Aba>('regras');
  // Trocar para um perfil mais simples nao pode deixar o painel numa aba que
  // ele nao mostra mais: a pessoa ficaria olhando para um painel vazio.
  const aba: Aba = abas.includes(escolhida) ? escolhida : (abas[0] ?? 'regras');
  const [rascunho, setRascunho] = useState('');
  const [erroDeTexto, setErroDeTexto] = useState<string | null>(null);

  const script = node?.script ?? null;

  // Ao abrir a aba de codigo, o texto vem da arvore. A partir dai quem manda e
  // o que a pessoa esta escrevendo, ate ela aplicar.
  useEffect(() => {
    if (aba === 'codigo') {
      setRascunho(imprimir(script ?? scriptVazio(node?.name ?? 'Script')));
      setErroDeTexto(null);
    }
  }, [aba, node?.id]);

  const problemas = useMemo(() => (script ? conferir(script) : []), [script]);

  if (!editor.scriptAberto || !node || abas.length === 0) return null;

  const trocar = (novo: Script): void => editor.setScript(novo);

  const aplicarTexto = (): void => {
    const leitura = ler(rascunho, node.name);
    if (!leitura.ok) {
      const { mensagem, linha, coluna, sugestao } = leitura.erro;
      setErroDeTexto(`Linha ${linha}, coluna ${coluna}: ${mensagem}${sugestao ? ` ${sugestao}` : ''}`);
      return;
    }
    setErroDeTexto(null);
    trocar(leitura.script);
    setAba('blocos');
  };

  const corpo = script?.corpo ?? [];

  return (
    <div className="programar">
      <header>
        <h2>
          {mostra.blocos ? 'Programar' : 'Regras'}
          <small>{node.name}</small>
        </h2>
        <div className="abas">
          {abas.map((candidata) => (
            <button
              key={candidata}
              className={aba === candidata ? 'ativa' : ''}
              onClick={() => setAba(candidata)}
            >
              {rotuloDaAba(candidata)}
            </button>
          ))}
        </div>
        <button className="fechar" onClick={() => editor.fecharScript()}>
          Fechar
        </button>
      </header>

      {aba === 'regras' ? <Regras editor={editor} node={node} /> : null}

      {aba === 'blocos' ? (
        <div className="conteudo">
          {corpo.length === 0 ? (
            <p className="vazio">
              Esta peça ainda não faz nada. Escolha um bloco de <b>quando</b> para começar:
              ele é o chapéu que segura os outros.
            </p>
          ) : null}

          <Corpo
            corpo={corpo}
            base={[]}
            script={script ?? scriptVazio(node.name)}
            problemas={problemas}
            trocar={trocar}
            topo
          />

          {problemas.length > 0 ? (
            <ul className="problemas">
              {problemas.map((problema, i) => (
                <li key={i}>
                  {problema.mensagem}
                  {problema.sugestao ? <em> {problema.sugestao}</em> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {aba === 'codigo' ? (
        <div className="conteudo codigo">
          <textarea
            value={rascunho}
            spellCheck={false}
            onChange={(event) => setRascunho(event.target.value)}
            {...pararTeclas}
          />
          {erroDeTexto ? <p className="erro">{erroDeTexto}</p> : null}
          <div className="acoes">
            <button className="primario" onClick={aplicarTexto}>
              Aplicar e ver como blocos
            </button>
            <span className="dica">
              É o mesmo script das duas formas. O que você escrever aqui vira bloco, e o
              que você montar lá vira este texto.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function rotuloDaAba(aba: Aba): string {
  if (aba === 'regras') return 'Regras';
  if (aba === 'blocos') return 'Blocos';
  return 'Código';
}

// --- Os blocos ---------------------------------------------------------------

interface CorpoProps {
  corpo: Instrucao[];
  base: Caminho;
  script: Script;
  problemas: Problema[];
  trocar: (script: Script) => void;
  topo?: boolean;
}

function Corpo({ corpo, base, script, problemas, trocar, topo }: CorpoProps) {
  const inserir = (instrucao: Instrucao): void => {
    const novo = copiar(script);
    const alvo = listaEm(novo.corpo, [...base, 0]);
    if (alvo) alvo.lista.push(instrucao);
    else novo.corpo.push(instrucao);
    trocar(novo);
  };

  return (
    <div className="pilha">
      {corpo.map((instrucao, indice) => (
        <Bloco
          key={indice}
          instrucao={instrucao}
          caminho={[...base, indice]}
          script={script}
          problemas={problemas}
          trocar={trocar}
        />
      ))}
      <Gaveta topo={topo === true} inserir={inserir} />
    </div>
  );
}

interface BlocoProps {
  instrucao: Instrucao;
  caminho: Caminho;
  script: Script;
  problemas: Problema[];
  trocar: (script: Script) => void;
}

function Bloco({ instrucao, caminho, script, problemas, trocar }: BlocoProps) {
  const culpado = problemas.some((p) => mesmoCaminho(p.caminho, caminho));

  const mexer = (mudar: (lista: Instrucao[], indice: number) => void): void => {
    const novo = copiar(script);
    const alvo = listaEm(novo.corpo, caminho);
    if (!alvo) return;
    mudar(alvo.lista, alvo.indice);
    trocar(novo);
  };

  const trocarValor = (troca: (instrucao: Instrucao) => void): void => {
    const novo = copiar(script);
    const alvo = instrucaoEm(novo.corpo, caminho);
    if (!alvo) return;
    troca(alvo);
    trocar(novo);
  };

  const filhos = ramos(instrucao);

  return (
    <div className={`bloco ${classeDe(instrucao)}${culpado ? ' culpado' : ''}`}>
      <div className="linha">
        <Rotulo instrucao={instrucao} trocarValor={trocarValor} />
        <span className="botoes">
          <button title="subir" onClick={() => mexer(mover(-1))}>
            ↑
          </button>
          <button title="descer" onClick={() => mexer(mover(1))}>
            ↓
          </button>
          <button title="apagar" onClick={() => mexer((lista, i) => lista.splice(i, 1))}>
            ✕
          </button>
        </span>
      </div>

      {filhos.map((ramo, i) => (
        <div className="dentro" key={ramo.rotulo}>
          {filhos.length > 1 ? <span className="ramo">{ramo.rotulo === 'entao' ? 'então' : 'senão'}</span> : null}
          <Corpo
            corpo={ramo.corpo}
            base={filhos.length > 1 ? [...caminho, i] : caminho}
            script={script}
            problemas={problemas}
            trocar={trocar}
          />
        </div>
      ))}
    </div>
  );
}

function mover(passo: number) {
  return (lista: Instrucao[], indice: number): void => {
    const destino = indice + passo;
    if (destino < 0 || destino >= lista.length) return;
    const [tirado] = lista.splice(indice, 1);
    lista.splice(destino, 0, tirado);
  };
}

/** O texto do bloco, com os buracos virando campos editáveis. */
function Rotulo({
  instrucao,
  trocarValor,
}: {
  instrucao: Instrucao;
  trocarValor: (troca: (instrucao: Instrucao) => void) => void;
}) {
  switch (instrucao.tipo) {
    case 'quando': {
      const evento = acharEvento(instrucao.evento);
      return (
        <span className="texto">
          {evento ? evento.forma : `quando ${instrucao.evento}`}
        </span>
      );
    }

    case 'nota':
      return (
        <span className="texto">
          <span className="palavra">nota</span>
          <input
            className="valor texto-longo"
            value={instrucao.texto}
            onChange={(event) => {
              const valor = event.target.value;
              trocarValor((alvo) => {
                if (alvo.tipo === 'nota') alvo.texto = valor;
              });
            }}
            {...pararTeclas}
          />
        </span>
      );

    case 'fazer': {
      const definicao = acharBloco(instrucao.chamada.nome);
      const forma = definicao ? definicao.forma : `${instrucao.chamada.nome} {…}`;
      let buraco = 0;
      return (
        <span className="texto">
          {pedacos(forma).map((pedaco, i) =>
            pedaco.tipo === 'palavra' ? (
              <span className="palavra" key={i}>
                {pedaco.texto}
              </span>
            ) : (
              <Valor
                key={i}
                expressao={instrucao.chamada.argumentos[buraco]}
                indice={buraco++}
                trocarValor={trocarValor}
              />
            ),
          )}
        </span>
      );
    }

    case 'criar':
    case 'guardar':
      return (
        <span className="texto">
          <span className="palavra">{instrucao.tipo === 'criar' ? 'criar' : 'guardar em'}</span>
          <span className="caixinha">{instrucao.nome}</span>
          <span className="palavra">o valor</span>
          <Valor expressao={instrucao.valor} indice={-1} trocarValor={trocarValor} />
        </span>
      );

    case 'se':
      return (
        <span className="texto">
          <span className="palavra">se</span>
          <Valor expressao={instrucao.condicao} indice={-2} trocarValor={trocarValor} />
        </span>
      );

    case 'enquanto':
      return (
        <span className="texto">
          <span className="palavra">enquanto</span>
          <Valor expressao={instrucao.condicao} indice={-2} trocarValor={trocarValor} />
        </span>
      );
  }
}

/**
 * Um valor dentro de um bloco.
 *
 * Numero, texto e sim/nao viram campo editavel. Conta e chamada aparecem como
 * codigo e so: mexer nelas e na aba de codigo. E uma limitacao honesta desta
 * fatia — e nao uma perda, porque as duas visoes seguem sendo a mesma arvore.
 */
function Valor({
  expressao,
  indice,
  trocarValor,
}: {
  expressao: Expressao | undefined;
  indice: number;
  trocarValor: (troca: (instrucao: Instrucao) => void) => void;
}) {
  if (!expressao) return <span className="valor faltando">?</span>;

  const escrever = (novo: Expressao): void => {
    trocarValor((alvo) => {
      if (indice >= 0 && alvo.tipo === 'fazer') alvo.chamada.argumentos[indice] = novo;
      else if (indice === -1 && (alvo.tipo === 'criar' || alvo.tipo === 'guardar')) alvo.valor = novo;
      else if (indice === -2 && (alvo.tipo === 'se' || alvo.tipo === 'enquanto')) {
        alvo.condicao = novo;
      }
    });
  };

  if (expressao.tipo === 'numero') {
    return (
      <input
        className="valor numero"
        type="number"
        value={expressao.valor}
        onChange={(event) => {
          const valor = Number(event.target.value);
          if (Number.isFinite(valor)) escrever({ tipo: 'numero', valor });
        }}
        {...pararTeclas}
      />
    );
  }

  if (expressao.tipo === 'texto') {
    return (
      <input
        className="valor texto-curto"
        value={expressao.valor}
        onChange={(event) => escrever({ tipo: 'texto', valor: event.target.value })}
        {...pararTeclas}
      />
    );
  }

  if (expressao.tipo === 'booleano') {
    return (
      <button
        className="valor booleano"
        onClick={() => escrever({ tipo: 'booleano', valor: !expressao.valor })}
      >
        {expressao.valor ? 'sim' : 'não'}
      </button>
    );
  }

  return <code className="valor conta">{textoDe(expressao)}</code>;
}

function textoDe(expressao: Expressao): string {
  const script: Script = {
    nome: '',
    corpo: [{ tipo: 'criar', nome: 'x', valor: expressao }],
  };
  return imprimir(script).replace(/^let x = /, '').replace(/;\n$/, '');
}

/** A gaveta de blocos: escolher um põe ele no fim desta pilha. */
function Gaveta({ topo, inserir }: { topo: boolean; inserir: (instrucao: Instrucao) => void }) {
  return (
    <select
      className="gaveta"
      value=""
      onChange={(event) => {
        const escolha = event.target.value;
        if (!escolha) return;
        inserir(criarInstrucao(escolha));
        event.target.value = '';
      }}
      {...pararTeclas}
    >
      <option value="">+ pôr um bloco aqui</option>
      {topo ? (
        <optgroup label="Quando…">
          {EVENTOS.map((evento) => (
            <option key={evento.nome} value={`evento:${evento.nome}`}>
              {evento.forma}
            </option>
          ))}
        </optgroup>
      ) : null}
      <optgroup label="Controle">
        <option value="controle:se">se … então</option>
        <option value="controle:enquanto">enquanto …</option>
        <option value="controle:criar">criar uma caixinha</option>
        <option value="controle:nota">nota</option>
      </optgroup>
      {(['movimento', 'cena', 'jogo', 'valores'] as const).map((categoria) => (
        <optgroup key={categoria} label={rotuloDaCategoria(categoria)}>
          {BLOCOS.filter((bloco) => bloco.categoria === categoria && bloco.devolve === null).map(
            (bloco) => (
              <option key={bloco.nome} value={`bloco:${bloco.nome}`}>
                {bloco.forma.replace(/\{[^}]+\}/g, '…')}
              </option>
            ),
          )}
        </optgroup>
      ))}
    </select>
  );
}

function rotuloDaCategoria(categoria: string): string {
  if (categoria === 'movimento') return 'Movimento';
  if (categoria === 'cena') return 'Outras peças';
  if (categoria === 'jogo') return 'Jogo';
  return 'Valores';
}

function criarInstrucao(escolha: string): Instrucao {
  const [tipo, nome] = escolha.split(':');

  if (tipo === 'evento') {
    const evento = acharEvento(nome);
    return { tipo: 'quando', evento: nome, parametro: evento?.parametro ?? null, corpo: [] };
  }

  if (tipo === 'controle') {
    if (nome === 'se') {
      return { tipo: 'se', condicao: { tipo: 'booleano', valor: true }, entao: [], senao: [] };
    }
    if (nome === 'enquanto') {
      return { tipo: 'enquanto', condicao: { tipo: 'booleano', valor: false }, corpo: [] };
    }
    if (nome === 'criar') {
      return { tipo: 'criar', nome: 'contador', valor: { tipo: 'numero', valor: 0 } };
    }
    return { tipo: 'nota', texto: 'escreva aqui' };
  }

  const definicao = acharBloco(nome);
  return {
    tipo: 'fazer',
    chamada: {
      tipo: 'chamada',
      nome,
      argumentos: definicao ? definicao.parametros.map((parametro) => copiar(parametro.padrao)) : [],
    },
  };
}

function classeDe(instrucao: Instrucao): string {
  switch (instrucao.tipo) {
    case 'quando':
      return 'b-quando';
    case 'se':
    case 'enquanto':
      return 'b-controle';
    case 'criar':
    case 'guardar':
      return 'b-caixinha';
    case 'nota':
      return 'b-nota';
    default:
      return 'b-fazer';
  }
}

function mesmoCaminho(a: Caminho, b: Caminho): boolean {
  return a.length === b.length && a.every((valor, i) => valor === b[i]);
}
