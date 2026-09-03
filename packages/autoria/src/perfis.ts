/**
 * Os perfis de interface — a secao 8 do plano, em codigo.
 *
 * Quatro pessoas, quatro interfaces, **uma engine**. O plano e explicito: nao
 * sao quatro editores, sao quatro cascas em cima do mesmo miolo. Por isso o
 * perfil mora aqui, na camada de autoria, e nao dentro do React: ele e uma
 * decisao sobre *o que faz sentido mostrar*, e nao sobre como desenhar.
 *
 * E por isso tambem que o perfil so lista o que **aparece**, e nunca o que a
 * engine sabe fazer. Trocar de perfil no meio do trabalho nao pode mudar a
 * fase, nem apagar o que ja existe: a peca programada com blocos continua
 * programada quando a mae abre o projeto no perfil Design — ela so nao ve os
 * blocos, e as regras que ela ve sao a mesma arvore lida de outro jeito
 * (secao 7).
 */

export type Perfil = 'crianca' | 'design' | 'criador' | 'programador';

/** O que um perfil mostra. Tudo que nao esta aqui, todos veem. */
export interface MostraPerfil {
  /** Gatilho e resposta: montar "quando … → faz …" so apontando e clicando. */
  regras: boolean;
  /** A gaveta de blocos e a pilha deles. */
  blocos: boolean;
  /** O script como texto de TypeScript. */
  codigo: boolean;
  /** Pausa e passo-a-passo durante o teste. */
  depuracao: boolean;
  /** O painel de quadros por segundo e orcamento. */
  performance: boolean;
}

/**
 * Como o perfil se comporta — a M12, e nao a secao 8.
 *
 * `MostraPerfil` responde "o que aparece"; isto responde "de que jeito". Sao
 * duas perguntas diferentes de proposito: o Modo Crianca mostra exatamente o
 * mesmo que o Design (regras sim, blocos e codigo nao), e mesmo assim e outra
 * interface. Se as duas coisas morassem no mesmo objeto, "botao grande" viraria
 * mais um painel que aparece ou some.
 */
export interface JeitoPerfil {
  /** Alvos de clique grandes e icone antes do rotulo. */
  botoesGrandes: boolean;
  /** Narracao por voz dos menus e dos avisos. */
  narracao: boolean;
  /** Pergunta antes de qualquer coisa que apaga. */
  confirmaApagar: boolean;
}

export interface PerfilSpec {
  id: Perfil;
  label: string;
  icone: string;
  /** Para quem ele foi feito, na linguagem do plano. */
  para: string;
  resumo: string;
  /**
   * Da para escolher ele hoje?
   *
   * O campo continua existindo depois da M12, que ligou o Modo Crianca: ele e
   * o lugar onde um perfil novo entra na lista antes de existir de verdade,
   * porque quem abre o editor merece saber o que esta no caminho.
   */
  disponivel: boolean;
  mostra: MostraPerfil;
  jeito: JeitoPerfil;
}

/**
 * O jeito de quem ja sabe usar um computador: sem voz, sem botao grande e sem
 * pergunta antes de apagar. Confirmar tudo para quem tem `Ctrl+Z` na mao seria
 * atrito, e nao seguranca.
 */
const JEITO_COMUM: JeitoPerfil = {
  botoesGrandes: false,
  narracao: false,
  confirmaApagar: false,
};

export const PERFIS: readonly PerfilSpec[] = [
  {
    id: 'crianca',
    label: 'Criança',
    icone: '🧒',
    para: 'o filho',
    resumo: 'Botões grandes, ícones e narração por voz. Pergunta antes de apagar.',
    disponivel: true,
    mostra: { regras: true, blocos: false, codigo: false, depuracao: false, performance: false },
    jeito: { botoesGrandes: true, narracao: true, confirmaApagar: true },
  },
  {
    id: 'design',
    label: 'Design',
    icone: '🎨',
    para: 'quem cria sem código',
    resumo: 'Cena, peças, cores e regras de "quando isso, faça aquilo". Zero código visível.',
    disponivel: true,
    mostra: { regras: true, blocos: false, codigo: false, depuracao: false, performance: false },
    jeito: JEITO_COMUM,
  },
  {
    id: 'criador',
    label: 'Criador',
    icone: '🧩',
    para: 'quem programa um pouco',
    resumo: 'Tudo do Design, mais os blocos e o passo-a-passo do teste.',
    disponivel: true,
    mostra: { regras: true, blocos: true, codigo: false, depuracao: true, performance: false },
    jeito: JEITO_COMUM,
  },
  {
    id: 'programador',
    label: 'Programador',
    icone: '⌨️',
    para: 'quem programa',
    resumo: 'Tudo, mais o código do script e o painel de performance.',
    disponivel: true,
    mostra: { regras: true, blocos: true, codigo: true, depuracao: true, performance: true },
    jeito: JEITO_COMUM,
  },
];

/**
 * O perfil de quem abre o editor pela primeira vez.
 *
 * Criador, e nao Design: quem instala uma engine de jogos hoje e quem programa
 * um pouco, e ele e o unico que consegue trocar o perfil para os outros. Um
 * padrao que esconde metade da engine faria a primeira impressao ser de uma
 * ferramenta menor do que ela e.
 */
export const PERFIL_PADRAO: Perfil = 'criador';

const POR_ID = new Map(PERFIS.map((perfil) => [perfil.id, perfil]));

export function acharPerfil(id: string): PerfilSpec {
  return POR_ID.get(id as Perfil) ?? POR_ID.get(PERFIL_PADRAO)!;
}

/** Perfil valido e disponivel, ou o padrao. Serve para ler o que foi salvo. */
export function perfilValido(id: string | null | undefined): Perfil {
  if (!id) return PERFIL_PADRAO;
  const perfil = POR_ID.get(id as Perfil);
  return perfil?.disponivel ? perfil.id : PERFIL_PADRAO;
}
