import { ler } from '@faisca/blocos';
import { FORMAT_VERSION, identityTransform, type SceneData, type SceneNode } from './documento.ts';

/**
 * A fase que abre junto com o editor.
 *
 * Ela existe para que a primeira coisa que aparece na tela nao seja um vazio
 * com um botao de "novo". E uma pista curta e completa — reta, rampa, trecho
 * suspenso, curva, aneis e cenario — feita das mesmas pecas do painel, para
 * que quem abrir consiga desmontar e remontar e entender como se faz.
 */
/** Le um script escrito a mao, para a fase de exemplo. */
function comScript(codigo: string): SceneNode['script'] {
  const leitura = ler(codigo.trim() + '\n');
  return leitura.ok ? leitura.script : null;
}

export function faseDeExemplo(): SceneData {
  const nodes: SceneNode[] = [];
  let contador = 0;

  function no(
    piece: string,
    name: string,
    transform: Partial<SceneNode['transform']>,
    parent: string | null = null,
    fields: SceneNode['fields'] = {},
    script: SceneNode['script'] = null,
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
      // Só quem tem script carrega a chave, igual ao que o leitor do arquivo
      // faz: assim a fase salva e a fase de exemplo são comparáveis campo a
      // campo, e o teste de ida e volta continua valendo.
      ...(script ? { script } : {}),
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
  // Comeca adiante do Ponto de Partida: um anel em cima de onde o personagem
  // nasce seria um ponto de graca, antes de o jogador fazer qualquer coisa.
  for (let i = 0; i < 8; i++) no('anel', `Anel ${i + 1}`, { y: 1.7, z: 5 + i * 2.2 }, coletaveis.id);
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

  // --- O que faz disto um jogo, e nao uma pista -----------------------------
  //
  // Com a M4, a fase de exemplo tem comeco, meio e fim: aneis para juntar,
  // inimigos para desviar ou pisar, uma mola de atalho e uma meta que termina
  // a fase. E a primeira coisa que a familia ve ao abrir o editor, entao ela
  // precisa ser jogavel do inicio ao fim sem ninguem editar nada.
  const jogo = no('grupo', 'Jogo', {});

  // Um patrulheiro atravessado na reta do chao, e outro na parte suspensa.
  // Guinada de 90 graus faz a ronda deles cruzar a pista, e nao acompanhar
  // ela: dá para desviar pelos lados ou pisar em cima.
  //
  // A ronda do primeiro é deslocada para um lado de propósito. Centrada, ela
  // varreria a pista inteira e viraria um pedágio: quem está aprendendo perde
  // os anéis ali toda vez, sem ter tido escolha. Deslocada, ela deixa um lado
  // livre — desviar, pular por cima ou encarar passa a ser decisão de quem
  // joga, e é isso que faz um inimigo ser um inimigo, e não um imposto.
  no('patrulheiro', 'Patrulheiro da reta', { x: 1.5, y: 0.5, z: 10, yaw: 90 }, jogo.id, {
    Patroller: { range: 2, speed: 3.5 },
  });
  no('patrulheiro', 'Patrulheiro suspenso', { y: 4, z: 32, yaw: 90 }, jogo.id, {
    Patroller: { range: 3, speed: 4.5 },
  });

  // Mola fora da linha de corrida: quem achar, sobe direto para o trecho
  // suspenso sem passar pela rampa.
  no('mola', 'Mola de atalho', { x: 3, y: 0.5, z: 12 }, jogo.id);

  // --- A regra-modelo da secao 7 -------------------------------------------
  //
  // *"Quando o jogador entra aqui → abre a porta e toca som."* E a frase que o
  // plano usa para explicar o que uma regra e, e ela esta aqui montada, no pe
  // da rampa: uma porta barrando a subida e uma area quatro unidades antes
  // dela.
  //
  // Ela e escrita aqui como codigo, e nao montada como arvore, pelo mesmo
  // motivo do Bloco Secreto: e assim que a familia escreve. E, no editor, ela
  // aparece como *regra* no perfil Design, como bloco no Criador e como este
  // mesmo texto no Programador — sem conversao no meio, porque e a mesma
  // arvore vista de tres jeitos.
  //
  // A porta nao fecha de volta: o "sair daqui" existe, mas fechar a porta na
  // saida da area fecharia ela na cara de quem acabou de passar.
  no('porta', 'Porta', { y: 0.5, z: 15.5 }, jogo.id);
  no(
    'area',
    'Entrada da rampa',
    { y: 0.5, z: 11.5 },
    jogo.id,
    {},
    comScript(`
on(AoEncostar, (jogador) => {
  abrir("Porta");
  tocarSom("porta");
  dizer("A porta abriu!");
});
`),
  );

  // A meta, em cima da plataforma solta do fim: chegar la exige o pulo.
  no('meta', 'Meta', { x: 22, y: 2.5, z: 50 }, jogo.id);

  // Cenario dos dois lados, para dar referencia de velocidade.
  for (let i = 0; i < 10; i++) {
    const z = i * 6;
    no('arvore', `Árvore esquerda ${i + 1}`, { x: -9 - (i % 3), z }, cenario.id);
    no('arvore', `Árvore direita ${i + 1}`, { x: 9 + ((i + 1) % 3), z }, cenario.id);
  }
  // Um bloco programado, para a fase de exemplo mostrar tambem a secao 7: o
  // mesmo script visto como blocos e como codigo. Ele e escrito aqui na
  // linguagem que a familia escreve, e nao montado no de dentro da arvore.
  no('bloco', 'Bloco Secreto', { x: -3.5, y: 0.5, z: 9 }, jogo.id, {}, comScript(`
on(ACadaQuadro, () => {
  girar(2);
});
on(AoEncostar, (jogador) => {
  dizer("Você achou o bloco secreto!");
  darAneis(5);
  esconder();
});
`));

  no('bloco', 'Bloco', { x: 0, z: -6 }, cenario.id);

  return { format: FORMAT_VERSION, name: 'Fase 1', nodes };
}
