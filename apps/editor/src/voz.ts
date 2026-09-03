import type { Voz } from '@faisca/autoria';

/**
 * A voz de verdade: `speechSynthesis`, do proprio navegador (M12).
 *
 * Fica aqui, e nao em `@faisca/autoria`, pela mesma razao que o `UiRenderer`
 * da M9 nao mora no runtime: o pacote decide *o que* dizer e *quando calar*
 * (`Narrador`), e falar e decisao de quem tem janela. Sem teste unitario, como
 * o `GameHud` e o proprio `UiRenderer` — o repositorio nao tem jsdom, e aqui
 * nao ha conta nenhuma para conferir.
 *
 * Nenhum byte sai da maquina: `speechSynthesis` fala com a voz que ja esta
 * instalada no sistema (secao 13, zero telemetria). Navegador sem voz nenhuma
 * simplesmente nao narra, e o resto do Modo Crianca continua funcionando.
 */
export class VozDoNavegador implements Voz {
  static disponivel(): boolean {
    return typeof globalThis.speechSynthesis !== 'undefined';
  }

  falar(texto: string): void {
    if (!VozDoNavegador.disponivel()) return;
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = 'pt-BR';
    // Um pouco mais devagar que o padrao: a narracao e para quem ainda esta
    // aprendendo a ler o que esta escrito no botao.
    fala.rate = 0.95;
    speechSynthesis.speak(fala);
  }

  calar(): void {
    if (VozDoNavegador.disponivel()) speechSynthesis.cancel();
  }
}
