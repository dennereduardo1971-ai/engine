import { FORMAT_VERSION, identityTransform, type SceneData, type SceneNode } from './documento.ts';

/**
 * A fase que abre junto com o editor.
 *
 * Ela existe para que a primeira coisa que aparece na tela nao seja um vazio
 * com um botao de "novo". E uma pista curta e completa — reta, rampa, trecho
 * suspenso, curva, aneis e cenario — feita das mesmas pecas do painel, para
 * que quem abrir consiga desmontar e remontar e entender como se faz.
 */
export function faseDeExemplo(): SceneData {
  const nodes: SceneNode[] = [];
  let contador = 0;

  function no(
    piece: string,
    name: string,
    transform: Partial<SceneNode['transform']>,
    parent: string | null = null,
    fields: SceneNode['fields'] = {},
  ): SceneNode {
    const node: SceneNode = {
      id: `n${++contador}`,
      name,
      piece,
      parent,
      transform: { ...identityTransform(), ...transform },
      fields,
      color: null,
      visible: true,
    };
    nodes.push(node);
    return node;
  }

  const pista = no('grupo', 'Pista', {});
  const coletaveis = no('grupo', 'Anéis', {});
  const cenario = no('grupo', 'Cenário', {});

  no('inicio', 'Ponto de Partida', { z: 2 });

  // Chao: tres retas seguidas, de 8 em 8.
  no('reta', 'Reta A', { z: 4 }, pista.id);
  no('reta', 'Reta B', { z: 12 }, pista.id);

  // Sobe 4 em 8 e continua suspenso. O topo da rampa fica em 4; as retas de
  // cima ficam em 3,5 para que o piso delas (3,5 + 0,5) encoste nele.
  no('rampa', 'Rampa', { z: 20 }, pista.id);
  no('reta', 'Reta Suspensa A', { y: 3.5, z: 28 }, pista.id);
  no('reta', 'Reta Suspensa B', { y: 3.5, z: 36 }, pista.id);

  // A curva gira em torno do centro dela, que fica 10 para o lado da pista.
  // Meia-volta de guinada faz ela virar para o lado certo de quem chega.
  no('curva', 'Curva', { x: 10, y: 3.5, z: 40, yaw: 180 }, pista.id);
  no('reta', 'Saída da Curva', { x: 14, y: 3.5, z: 50, yaw: 90 }, pista.id);
  no('plataforma', 'Plataforma solta', { x: 22, y: 2, z: 50, yaw: 90 }, pista.id);

  // Trilha de aneis: no chao, subindo a rampa e acompanhando a curva.
  for (let i = 0; i < 8; i++) no('anel', `Anel ${i + 1}`, { y: 1.7, z: 2 + i * 2.2 }, coletaveis.id);
  for (let i = 0; i < 5; i++) {
    no('anel', `Anel da rampa ${i + 1}`, { y: 1.9 + i * 0.8, z: 18 + i * 1.6 }, coletaveis.id);
  }
  for (let i = 0; i < 7; i++) {
    const angulo = (i / 6) * (Math.PI / 2);
    no(
      'anel',
      `Anel da curva ${i + 1}`,
      { x: 10 - Math.cos(angulo) * 10, y: 5.2, z: 40 + Math.sin(angulo) * 10 },
      coletaveis.id,
    );
  }

  // Cenario dos dois lados, para dar referencia de velocidade.
  for (let i = 0; i < 10; i++) {
    const z = i * 6;
    no('arvore', `Árvore esquerda ${i + 1}`, { x: -9 - (i % 3), z }, cenario.id);
    no('arvore', `Árvore direita ${i + 1}`, { x: 9 + ((i + 1) % 3), z }, cenario.id);
  }
  no('bloco', 'Bloco', { x: 0, z: -6 }, cenario.id);

  return { format: FORMAT_VERSION, name: 'Fase 1', nodes };
}
