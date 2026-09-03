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
 * componente. glTF, Aseprite, Tiled e Blender ainda não têm importador; o
 * aviso de erro do `@faisca/assets` explica isso na barra do editor.
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
          void editor.importarArquivos(event.dataTransfer.files);
        }}
      >
        Arraste arquivos aqui, ou clique para escolher
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

      <div className="lista assets-lista">
        {itens.length === 0 ? (
          <p className="vazio">Nenhum asset ainda.</p>
        ) : (
          itens.map((asset) => (
            <div className="ramo" key={asset.caminho} title={asset.caminho}>
              <span className="icone">{ICONE[asset.tipo]}</span>
              <span className="nome">{asset.caminho}</span>
              <span className="conta">{formatarTamanho(asset.tamanho)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
