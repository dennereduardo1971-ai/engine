import * as RAPIER from '@dimforge/rapier3d-compat';

/**
 * O Rapier — a fisica da Faisca (secao 2 do plano).
 *
 * Ele e Rust compilado para WebAssembly, e o wasm precisa ser carregado antes
 * do primeiro uso. Por isso este modulo existe: ele guarda o carregamento
 * numa promessa so, e o resto da engine pergunta por `rapier()` sem nunca
 * precisar ser `async`.
 *
 * A escolha do pacote e o `-compat`, que traz o wasm embutido no proprio
 * arquivo JavaScript. Custa alguns megabytes no pacote do editor, e poupa a
 * configuracao de wasm em todo lugar que empacota a engine — inclusive no
 * empacotamento desktop, que e o que a familia vai usar.
 */
export type Rapier = typeof RAPIER;

/**
 * Tipos do Rapier reexportados.
 *
 * Quem esta acima do runtime — kits, autoria, editor — se refere a um colisor
 * por este tipo, e nunca importando `@dimforge/rapier3d-compat` direto. Alem
 * de respeitar a regra das camadas, isso evita um problema concreto: se dois
 * pacotes resolverem copias diferentes da biblioteca, o TypeScript passa a
 * tratar `Collider` como dois tipos sem parentesco, e nada mais encaixa.
 */
export type Collider = RAPIER.Collider;
export type RigidBody = RAPIER.RigidBody;
export type Shape = RAPIER.Shape;

let carregado: Rapier | null = null;
let carregando: Promise<Rapier> | null = null;

/**
 * Carrega o Rapier. Pode ser chamado quantas vezes quiser: o wasm e lido uma
 * vez so, e chamadas ao mesmo tempo esperam a mesma promessa.
 */
export function loadRapier(): Promise<Rapier> {
  if (carregado) return Promise.resolve(carregado);
  carregando ??= RAPIER.init().then(() => {
    carregado = RAPIER;
    return RAPIER;
  });
  return carregando;
}

export function rapierReady(): boolean {
  return carregado !== null;
}

/** O Rapier ja carregado. Erra em portugues se alguem esquecer o `await`. */
export function rapier(): Rapier {
  if (!carregado) {
    throw new Error(
      'Faísca: a física ainda não carregou. Chame `await loadRapier()` antes de criar a engine.',
    );
  }
  return carregado;
}
