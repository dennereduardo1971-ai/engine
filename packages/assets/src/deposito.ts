import { type CatalogoDeAssets } from './catalogo.ts';

/**
 * Os bytes dos arquivos importados, por caminho do projeto.
 *
 * O `CatalogoDeAssets` guarda a *decisão* — que tipo é, se mudou, do que
 * ele depende — e de propósito não guarda conteúdo: é isso que deixa o
 * catálogo ser uma coisa pequena, comparável e fácil de salvar. Só que
 * desenhar um modelo precisa dos bytes de verdade, e no navegador eles não
 * estão em lugar nenhum depois que o `File` do arrasto sai de escopo.
 *
 * Este depósito é esse lugar. Ele é burro por escolha: um mapa de caminho
 * para bytes, sem hash, sem tipo, sem regra — quem tem regra é o catálogo,
 * e os dois andam juntos (`registrarNos`).
 */
export class DepositoDeArquivos {
  private readonly bytes = new Map<string, Uint8Array>();

  guardar(caminho: string, conteudo: Uint8Array): void {
    this.bytes.set(caminho, conteudo);
  }

  ler(caminho: string): Uint8Array | null {
    return this.bytes.get(caminho) ?? null;
  }

  tem(caminho: string): boolean {
    return this.bytes.has(caminho);
  }

  esquecer(caminho: string): boolean {
    return this.bytes.delete(caminho);
  }

  get tamanho(): number {
    let total = 0;
    for (const conteudo of this.bytes.values()) total += conteudo.length;
    return total;
  }

  /**
   * Importa no catálogo e guarda os bytes na mesma chamada — os dois lados
   * de "este arquivo entrou no projeto". Devolve o que `registrar` devolve.
   *
   * O byte só é guardado se o catálogo aceitou o arquivo: um formato que o
   * importador recusa não deixa lixo aqui.
   */
  registrarNos(
    catalogo: CatalogoDeAssets,
    caminho: string,
    conteudo: Uint8Array,
    opcoes?: Parameters<CatalogoDeAssets['registrar']>[2],
  ): ReturnType<CatalogoDeAssets['registrar']> {
    const resultado = catalogo.registrar(caminho, conteudo, opcoes);
    this.guardar(caminho, conteudo);
    return resultado;
  }
}
