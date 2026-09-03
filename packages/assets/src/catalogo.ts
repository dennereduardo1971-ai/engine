import { importarAsset, type OpcoesImportar } from './importar.ts';
import { type AssetMeta } from './tipos.ts';

/** O que `registrar` conta pra quem chamou: o asset, e se ele mudou. */
export interface ResultadoRegistro {
  asset: AssetMeta;
  /** `true` na primeira importacao e sempre que o hash muda. */
  mudou: boolean;
}

/**
 * O catalogo de assets de um projeto: um asset por `caminho`.
 *
 * A secao 11 do plano pede "reimport automatico quando o arquivo muda no
 * disco". Ficar de olho no disco e trabalho do editor (`apps/editor`,
 * `fs.watch` ou o watcher do Vite) — o que este pacote guarda e a decisao
 * pura de cima: dado um caminho e os bytes de agora, o asset e novo, mudou,
 * ou e o mesmo de sempre? Isso e testavel sem tocar em disco nenhum, e o
 * editor so precisa chamar `registrar` de novo toda vez que o watcher
 * disparar.
 */
export class CatalogoDeAssets {
  private readonly itens = new Map<string, AssetMeta>();

  listar(): AssetMeta[] {
    return [...this.itens.values()];
  }

  obter(caminho: string): AssetMeta | undefined {
    return this.itens.get(caminho);
  }

  /** Importa (ou reimporta) o arquivo em `caminho` e guarda no catalogo. */
  registrar(caminho: string, bytes: Uint8Array, opcoes?: OpcoesImportar): ResultadoRegistro {
    const anterior = this.itens.get(caminho);
    const asset = importarAsset(caminho, bytes, opcoes);
    this.itens.set(caminho, asset);
    return { asset, mudou: anterior === undefined || anterior.hash !== asset.hash };
  }

  remover(caminho: string): boolean {
    return this.itens.delete(caminho);
  }

  /**
   * Tira do catalogo tudo que nao esta mais em `caminhosPresentes` — o
   * arquivo foi apagado ou movido no disco. Devolve os caminhos removidos.
   */
  removerAusentes(caminhosPresentes: Iterable<string>): string[] {
    const presentes = new Set(caminhosPresentes);
    const removidos: string[] = [];
    for (const caminho of this.itens.keys()) {
      if (!presentes.has(caminho)) removidos.push(caminho);
    }
    for (const caminho of removidos) this.itens.delete(caminho);
    return removidos;
  }
}
