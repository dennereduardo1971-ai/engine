import {
  describeComponent,
  factoryValues,
  findPiece,
  pieceOrPlaceholder,
  type SceneNode,
} from '@faisca/autoria';
import { type Editor } from '../editor.ts';
import { Deslizador, Numero, pararTeclas, Texto } from './campos.tsx';

/**
 * O inspetor — onde os valores viram deslizadores.
 *
 * Ele nao sabe nada sobre nenhum componente em particular: pergunta a camada
 * de autoria como cada um se apresenta (nome em portugues, campos, faixas) e
 * monta a interface a partir da resposta. Componente novo aparece aqui no
 * mesmo dia em que e criado.
 */
export function Inspetor({ editor }: { editor: Editor }) {
  const node = editor.selectedNode;

  if (!node) {
    return (
      <section className="painel inspetor">
        <h2>Inspetor</h2>
        <p className="vazio">
          Clique numa peça para ver e mudar os valores dela. Com o jogo rodando, o que você
          mudar aqui vale na hora, sem reiniciar a fase.
        </p>
      </section>
    );
  }

  const piece = pieceOrPlaceholder(node.piece);
  // Os componentes vem da peca; `node.fields` guarda so o que foi mexido. Sem
  // esta uniao, um Ponto de Partida recem-carregado de um arquivo abriria sem
  // deslizador nenhum, porque nada nele foi editado ainda.
  const componentes = [...new Set([...Object.keys(piece.components), ...Object.keys(node.fields)])];

  return (
    <section className="painel inspetor">
      <h2>
        Inspetor
        <small>{piece.label}</small>
      </h2>

      <div className="bloco">
        <label className="campo">
          <span className="rotulo">Nome</span>
          <Texto valor={node.name} onChange={(valor) => editor.rename(valor)} />
        </label>
        <label className="campo">
          <span className="rotulo">Dentro de</span>
          <select
            value={node.parent ?? ''}
            onChange={(event) => editor.setParent(event.target.value || null)}
            {...pararTeclas}
          >
            <option value="">— a fase —</option>
            {editor.document.nodes
              .filter((outro) => outro.id !== node.id)
              .map((outro) => (
                <option key={outro.id} value={outro.id}>
                  {outro.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <Transformar editor={editor} node={node} />

      {componentes.length === 0 ? null : (
        <div className="bloco">
          {componentes.map((nome) => {
            const spec = describeComponent(nome);
            if (spec.fields.length === 0) return null;
            const valores = node.fields[nome] ?? {};
            return (
              <div key={nome} className="componente">
                <h3>{spec.label}</h3>
                {spec.fields.map((campo) => (
                  <Deslizador
                    key={campo.field}
                    rotulo={campo.label}
                    unidade={campo.unit}
                    ajuda={campo.hint}
                    min={campo.min}
                    max={campo.max}
                    step={campo.step}
                    valor={valores[campo.field] ?? valorDeFabrica(node, nome, campo.field)}
                    onChange={(valor) => editor.setField(nome, campo.field, valor)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="bloco acoes">
        <button type="button" onClick={() => editor.duplicateSelection()}>
          Duplicar
        </button>
        <button type="button" className="perigo" onClick={() => editor.deleteSelection()}>
          Apagar
        </button>
      </div>
    </section>
  );
}

function Transformar({ editor, node }: { editor: Editor; node: SceneNode }) {
  const piece = pieceOrPlaceholder(node.piece);
  const t = node.transform;

  return (
    <div className="bloco">
      <h3>Transformar</h3>
      <div className="trio">
        <span className="rotulo">Posição</span>
        <Numero
          valor={t.x}
          titulo="X"
          step={0.5}
          onChange={(valor) => editor.setTransform({ x: valor }, `x:${node.id}`)}
        />
        <Numero
          valor={t.y}
          titulo="Y (altura)"
          step={0.5}
          onChange={(valor) => editor.setTransform({ y: valor }, `y:${node.id}`)}
        />
        <Numero
          valor={t.z}
          titulo="Z"
          step={0.5}
          onChange={(valor) => editor.setTransform({ z: valor }, `z:${node.id}`)}
        />
      </div>

      <div className="linha-de-giro">
        <span className="rotulo">Giro</span>
        <Numero
          valor={t.yaw}
          step={45}
          onChange={(valor) => editor.setTransform({ yaw: valor }, `giro:${node.id}`)}
        />
        <button type="button" title="Girar 45° para a esquerda" onClick={() => editor.rotateSelection(-45)}>
          ↺
        </button>
        <button type="button" title="Girar 45° para a direita (tecla R)" onClick={() => editor.rotateSelection(45)}>
          ↻
        </button>
      </div>

      <div className="trio">
        <span className="rotulo">Tamanho</span>
        <Numero
          valor={t.sx}
          titulo="Largura"
          step={0.25}
          onChange={(valor) => editor.setTransform({ sx: valor }, `sx:${node.id}`)}
        />
        <Numero
          valor={t.sy}
          titulo="Altura"
          step={0.25}
          onChange={(valor) => editor.setTransform({ sy: valor }, `sy:${node.id}`)}
        />
        <Numero
          valor={t.sz}
          titulo="Comprimento"
          step={0.25}
          onChange={(valor) => editor.setTransform({ sz: valor }, `sz:${node.id}`)}
        />
      </div>

      {piece.instanced ? (
        // Quem esta num lote divide o material com o lote inteiro — e e isso
        // que faz mil aneis custarem uma chamada de desenho so.
        <p className="nota">Peças instanciadas usam a cor do lote.</p>
      ) : (
        <label className="campo">
          <span className="rotulo">Cor</span>
          <span className="cor">
            <input
              type="color"
              value={`#${(node.color ?? piece.color).toString(16).padStart(6, '0')}`}
              onChange={(event) => editor.setColor(Number.parseInt(event.target.value.slice(1), 16))}
              {...pararTeclas}
            />
            {node.color === null ? null : (
              <button type="button" className="link" onClick={() => editor.setColor(null)}>
                voltar à cor da peça
              </button>
            )}
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * Valor que o componente teria sem ninguem ter mexido. Enquanto o campo nao
 * foi editado, o inspetor mostra o de fabrica, e nao um zero mentiroso — os
 * valores vem do proprio kit, e nao de uma copia guardada aqui.
 */
function valorDeFabrica(node: SceneNode, componente: string, campo: string): number {
  const daPeca = findPiece(node.piece)?.components[componente]?.[campo];
  return daPeca ?? factoryValues(componente)[campo] ?? 0;
}
