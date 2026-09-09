import { useState } from 'react';
import { type AssetKind } from '@faisca/assets';
import { type Editor } from '../editor.ts';

const ICONE: Record<AssetKind, string> = {
  textura: '🖼️',
  modelo: '🧊',
  som: '🔊',
  musica: '🎵',
};

/**
 * O painel de Assets (seção 11): o catálogo do projeto, com o kit inicial
 * já dentro, e uma zona de arrastar-e-soltar para importar mais.
 *
 * Arrastar de novo um arquivo com o mesmo nome não duplica — é reimportação,
 * e quem decide se mudou é o hash guardado em `editor.catalogo`, não este
 * componente.
 *
 * Um `.glb`/`.gltf` ganha um botão "na cena": é o caminho mais curto entre
 * arrastar o arquivo e vê-lo na fase. Arrastar a *pasta* de um modelo
 * funciona e é o jeito certo para um `.gltf`, que aponta para o `.bin` e
 * para `textures/` ao lado — um `.gltf` sem eles aparece na lista dizendo o
 * que falta, em vez de virar uma peça vazia depois.
 */
export function Assets({ editor }: { editor: Editor }) {
  const [sobre, setSobre] = useState(false);
  const itens = editor.catalogo.listar();

  return (
    <section className="painel assets">
      <h2>
        Assets
        <small>{itens.length}</small>
      </h2>

      <label
        className={`zona-de-soltar${sobre ? ' sobre' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(event) => {
          event.preventDefault();
          setSobre(false);
          void editor.importarArrasto(event.dataTransfer);
        }}
      >
        Arraste arquivos ou pastas aqui, ou clique para escolher
        <input
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void editor.importarArquivos(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      <label className="botao">
        Sincronizar pasta assets/
        <input
          type="file"
          hidden
          // @ts-expect-error -- webkitdirectory nao esta no tipo do React, mas o navegador entende.
          webkitdirectory=""
          directory=""
          onChange={(event) => {
            if (event.target.files) void editor.sincronizarPasta(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      <div className="lista assets-lista">
        {itens.length === 0 ? (
          <p className="vazio">Nenhum asset ainda.</p>
        ) : (
          itens.map((asset) => {
            const faltando = editor.catalogo.faltando(asset.caminho);
            return (
              <div className="ramo" key={asset.caminho} title={asset.caminho}>
                <span className="icone">{ICONE[asset.tipo]}</span>
                <span className="nome">
                  {asset.caminho}
                  {faltando.length > 0 ? (
                    <small className="aviso"> falta {faltando.join(', ')}</small>
                  ) : null}
                </span>
                {ehModelo(asset.caminho) ? (
                  <button
                    type="button"
                    className="mini"
                    title="Pôr este modelo na fase"
                    onClick={() => editor.adicionarModelo(asset.caminho)}
                  >
                    na cena
                  </button>
                ) : null}
                <span className="conta">{formatarTamanho(asset.tamanho)}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function ehModelo(caminho: string): boolean {
  return /\.(glb|gltf)$/i.test(caminho);
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
