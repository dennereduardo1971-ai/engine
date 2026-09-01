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
  Collectible,
  Goal,
  Spring,
  trackToysSystem,
  renascer,
  resetTrackToys,
  foiColetado,
  type TrackToysOptions,
} from './brinquedos.ts';

export { GameHud, formatarTempo, type GameHudOptions } from './hud.ts';

export {
  Partida,
  somarProgresso,
  PROGRESSO_VAZIO,
  type EstadoDaPartida,
  type ProgressoDaFase,
  type ResumoDaPartida,
} from './partida.ts';

export {
  FollowCamera,
  followCameraSystem,
  makeFollowCamera,
  type FollowCameraOptions,
} from './camera.ts';
