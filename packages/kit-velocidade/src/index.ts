/**
 * Kit Velocidade — o coracao Sonic da Faisca.
 *
 * Camada de kits: conhece o runtime, e o runtime nao conhece ele. Aqui moram o
 * controlador de personagem, a camera que segue e, mais para frente, molas,
 * aceleradores, rails, loops e aneis.
 */
export {
  SpeedCharacter,
  speedCharacterSystem,
  speedCharacterDefaults,
  makeSpeedCharacter,
  groundSpeed,
  aproximarAngulo,
  type SpeedCharacterOptions,
} from './character.ts';

export {
  FollowCamera,
  followCameraSystem,
  makeFollowCamera,
  type FollowCameraOptions,
} from './camera.ts';
