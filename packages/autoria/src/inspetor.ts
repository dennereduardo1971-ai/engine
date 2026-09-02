import {
  type Component,
  componentRegistry,
  type Entity,
  type Schema,
  World,
} from '@faisca/runtime';
import {
  FollowCamera,
  makeFollowCamera,
  makeSpeedCharacter,
  SpeedCharacter,
} from '@faisca/kit-velocidade';
import { Porta } from '@faisca/kit-brinquedos';

/**
 * O que o inspetor mostra de cada componente.
 *
 * O plano e claro na secao 6: os componentes tem nome em ingles no codigo e em
 * portugues na interface. O componente ja carrega os dois nomes; o que falta
 * para um inspetor decente e o nome de cada *campo* e a faixa de cada
 * deslizador — e isso mora aqui, na camada de autoria, e nao no runtime.
 *
 * A razao e a regra de ouro das camadas (secao 4): o runtime vai dentro do
 * jogo publicado, e o jogo publicado nao tem inspetor. Faixa de deslizador e
 * assunto de quem edita.
 */

export interface FieldSpec {
  field: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Unidade mostrada ao lado do numero. */
  unit?: string;
  /** Uma linha explicando para que serve, em portugues de gente. */
  hint?: string;
}

export interface ComponentSpec {
  component: string;
  label: string;
  /** So estes campos aparecem: o resto e estado interno, nao ajuste. */
  fields: FieldSpec[];
}

const SPECS: readonly ComponentSpec[] = [
  {
    component: 'SpeedCharacter',
    label: 'Personagem Veloz',
    fields: [
      { field: 'maxSpeed', label: 'Velocidade máxima', min: 2, max: 80, step: 0.5, unit: 'u/s' },
      { field: 'accel', label: 'Aceleração', min: 5, max: 200, step: 1, unit: 'u/s²' },
      {
        field: 'friction',
        label: 'Atrito',
        min: 0,
        max: 120,
        step: 1,
        hint: 'Quanto ele perde de velocidade sem ninguém acelerando.',
      },
      {
        field: 'skidDecel',
        label: 'Freio da derrapagem',
        min: 0,
        max: 250,
        step: 5,
        hint: 'Inverter a direção correndo freia em vez de virar.',
      },
      { field: 'airAccel', label: 'Controle no ar', min: 0, max: 90, step: 1 },
      { field: 'turnRate', label: 'Rapidez da curva', min: 1, max: 30, step: 0.5, unit: 'rad/s' },
      { field: 'jumpSpeed', label: 'Força do pulo', min: 2, max: 45, step: 0.5 },
      {
        field: 'jumpCut',
        label: 'Pulo curto',
        min: 0,
        max: 40,
        step: 0.5,
        hint: 'Velocidade que sobra ao soltar o botão no meio da subida.',
      },
      { field: 'gravity', label: 'Gravidade', min: 0, max: 150, step: 1 },
    ],
  },
  {
    component: 'FollowCamera',
    label: 'Câmera que Segue',
    fields: [
      { field: 'distance', label: 'Distância', min: 2, max: 40, step: 0.5 },
      { field: 'height', label: 'Altura', min: 0, max: 20, step: 0.2 },
      { field: 'lookHeight', label: 'Altura do olhar', min: 0, max: 10, step: 0.1 },
      {
        field: 'damping',
        label: 'Suavidade',
        min: 0.5,
        max: 20,
        step: 0.5,
        hint: 'Maior é mais colada no personagem.',
      },
      { field: 'lookSensitivity', label: 'Sensibilidade do olhar', min: 0.2, max: 8, step: 0.1 },
      {
        field: 'autoAlign',
        label: 'Volta sozinha',
        min: 0,
        max: 8,
        step: 0.1,
        hint: 'Quão rápido ela volta para trás do personagem.',
      },
      { field: 'fovBase', label: 'Campo de visão parado', min: 30, max: 110, step: 1, unit: '°' },
      { field: 'fovWide', label: 'Campo de visão a toda', min: 30, max: 130, step: 1, unit: '°' },
      { field: 'fovSpeed', label: 'Velocidade do campo cheio', min: 1, max: 60, step: 1 },
    ],
  },
  {
    component: 'Porta',
    label: 'Porta',
    fields: [
      {
        field: 'travel',
        label: 'Quanto desce',
        min: 0,
        max: 30,
        step: 0.5,
        hint: 'Um pouco mais que a altura dela some a porta inteira no chão.',
      },
      { field: 'speed', label: 'Velocidade', min: 0.5, max: 40, step: 0.5, unit: 'u/s' },
    ],
  },
];

const BY_COMPONENT = new Map(SPECS.map((spec) => [spec.component, spec]));

/**
 * Descricao de um componente para o inspetor. Sem descricao escrita a mao, ela
 * e deduzida do proprio componente: rotulo em portugues do registro e um campo
 * por campo do esquema. Componente novo aparece no inspetor no mesmo dia em
 * que e criado, mesmo sem ninguem escrever a descricao dele.
 */
export function describeComponent(name: string): ComponentSpec {
  const escrita = BY_COMPONENT.get(name);
  if (escrita) return escrita;

  const registrado = componentRegistry.find((component) => component.name === name);
  if (!registrado) return { component: name, label: name, fields: [] };

  return {
    component: name,
    label: registrado.label,
    fields: Object.keys(registrado.schema).map((field) => ({
      field,
      label: field,
      min: -1000,
      max: 1000,
      step: 0.1,
    })),
  };
}

export function componentLabel(name: string): string {
  return describeComponent(name).label;
}

/** Todos os componentes com descricao escrita a mao. */
export function describedComponents(): readonly ComponentSpec[] {
  return SPECS;
}

/**
 * Valores de fabrica de um componente.
 *
 * O inspetor precisa deles para mostrar o numero certo num campo que ninguem
 * mexeu ainda — sem isso, uma velocidade maxima de 24 apareceria como 0 ate a
 * primeira mexida, e o deslizador mentiria.
 *
 * Eles sao *lidos do proprio kit*, e nao copiados para ca. Copiar seria criar
 * uma segunda verdade que envelhece calada no dia em que alguem mudar o valor
 * de fabrica do personagem.
 */
export function factoryValues(component: string): Record<string, number> {
  return FABRICA[component] ?? {};
}

/**
 * A leitura acontece uma vez, quando este modulo carrega — antes de qualquer
 * engine existir. Os componentes sao globais e enderecados por entidade: fazer
 * isso depois, com o jogo rodando, poderia esbarrar numa entidade de verdade.
 */
const FABRICA: Record<string, Record<string, number>> = lerValoresDeFabrica();

function lerValoresDeFabrica(): Record<string, Record<string, number>> {
  const mundo = new World();
  const rascunho = mundo.create();
  const saida: Record<string, Record<string, number>> = {};

  makeSpeedCharacter(rascunho);
  saida[SpeedCharacter.name] = lerCampos(SpeedCharacter, rascunho);
  makeFollowCamera(rascunho, rascunho);
  saida[FollowCamera.name] = lerCampos(FollowCamera, rascunho);
  Porta.add(rascunho);
  saida[Porta.name] = lerCampos(Porta, rascunho);

  mundo.destroy(rascunho);
  return saida;
}

function lerCampos(component: Component<Schema>, entity: Entity): Record<string, number> {
  const slot = component.slotOf(entity);
  const saida: Record<string, number> = {};
  if (slot < 0) return saida;
  const fields = component.fields as Record<string, ArrayLike<number>>;
  for (const campo of Object.keys(component.schema)) saida[campo] = fields[campo][slot];
  return saida;
}
