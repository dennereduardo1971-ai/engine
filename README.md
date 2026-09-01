# Faísca

Uma engine de jogos 2D e 3D feita para uma família criar jogos junto — com blocos visuais
para quem não programa, código para quem quiser, e um Modo Criança para quem ainda não lê.

O jogo de referência é um **Sonic 3D**: velocidade, momentum, loops, molas, rails e anéis.

**Meta técnica:** 60 fps num i5 com gráficos Intel integrados e 8 GB de RAM.

- Núcleo em TypeScript sobre **Three.js** (WebGL2 por padrão, WebGPU quando disponível)
- Física em **Rapier** (Rust compilado para WebAssembly), 2D e 3D
- ECS por baixo, árvore de objetos amigável por cima
- Editor no navegador, offline-first, empacotável como app desktop
- Blocos visuais e TypeScript são a **mesma árvore**, com ida e volta sem perdas

📄 **[Plano completo do projeto](docs/PLANO.md)**

## Estado

**M0, M1, M2 e M3 entregues.** Uma janela 3D abre, o laço de passo fixo gira, o painel de
performance responde a pergunta do M0 — *esta máquina aguenta 60 fps?* — com número na
mão, e tem um bonequinho que anda com o controle de Xbox, com câmera que segue sozinha.

Tem **editor**: `npm run dev` abre uma tela onde dá para montar uma pista com peças, mexer
nos valores num inspetor, apertar **Jogar** e correr na fase que você acabou de montar —
sem sair da tela, sem recompilar nada.

E, com a **M2**, tem **loop-the-loop**. A física é o Rapier de verdade: cada peça vira um
colisor de malha, do jeito que ela é desenhada. O personagem passou a ter um *"para cima"
próprio*, alinhado à normal do chão — é isso, e só isso, que faz loop, parede e corkscrew
funcionarem, porque correr no teto e correr no chão viram o mesmo código. A gravidade, no
chão, entra como inclinação: descer ganha velocidade e subir perde, sem nenhum caso
especial para rampa. E ela só puxa para fora da superfície quando a velocidade cai abaixo
do limite de aderência — o instante exato em que o Sonic despenca do loop se estiver
devagar.

Próxima fatia: **M4** — anéis, molas, inimigo patrulheiro, meta, HUD e save: *um jogo
completo, do início ao fim*.

### Arestas conhecidas

- Dentro do loop, a câmera para na parede em vez de atravessá-la, mas o enquadramento
  ainda é ruim: o aro fica entre ela e o personagem. Câmera que não sobe junto no loop é
  trabalho do Kit Velocidade, ainda por fazer.
- O pacote do jogo passou de 0,5 MB para 2,7 MB, quase tudo wasm do Rapier embutido. Cabe
  folgado nos 15 MB que o plano dá para um jogo publicado, mas é o piso agora.

## Como rodar

Precisa de Node 20.19 ou mais novo.

```bash
npm install
npm run dev          # o editor, em http://localhost:5174
```

Outros comandos:

```bash
npm run playground   # a cena de referência de performance, em http://localhost:5173
npm test             # ECS, laço, entrada, personagem, documento de cena e orçamento
npm run orcamento    # só o orçamento de performance, com os números medidos
npm run typecheck
npm run build        # empacota o editor e a cena de referência
```

## O editor

Ele abre com uma fase de exemplo pronta — uma pista curta com reta, rampa, trecho
suspenso, curva, anéis e árvores — feita das mesmas peças do painel, para dar para
desmontar e entender.

| | |
|---|---|
| **Peças** (esquerda, em cima) | Escolha uma e clique no chão para colocar. Sem peça na mão, o clique seleciona. |
| **Cena** (esquerda, embaixo) | A árvore da fase. Clique para selecionar, no olho para esconder. |
| **Inspetor** (direita) | Nome, pai, posição, giro, tamanho, cor — e os deslizadores dos componentes. |
| **Barra** (em cima) | Nova, Exemplo, Baixar, Abrir, Desfazer, Refazer e o **Jogar**. |

No viewport: **botão esquerdo** seleciona e arrasta, **direito** gira a câmera, **meio**
arrasta a vista, a **roda** aproxima. `R` gira 45°, `Del` apaga, `Ctrl+D` duplica,
`Ctrl+Z` desfaz, `PageUp` e `PageDown` sobem e descem a peça, `Esc` larga o pincel.

**Jogar** põe o personagem no Ponto de Partida e devolve o controle para você — controle
de Xbox ou teclado, igual à cena de referência. **Pausar** congela a simulação sem apagar
a tela, e **Passo** anda um passo fixo de cada vez. **Parar** volta para a edição, na
mesma vista de câmera em que você estava.

### Hot reload, que é o ponto da fatia

Selecione o Ponto de Partida **com o jogo rodando** e puxe a *Velocidade máxima*. O
personagem que já está correndo muda na hora. A fase não reinicia, o bonequinho não volta
para o começo, e você continua no meio da curva.

É essa a promessa da seção 8 do plano — *mudar um valor e ver o efeito sem reiniciar a
fase* — e é por isso que o documento de cena avisa quem escuta a cada mudança, em vez de
o editor remontar o mundo a cada tecla digitada.

### Salvar

A fase se salva sozinha na máquina meio segundo depois da última mudança (offline-first,
seção 2 do plano) e volta sozinha quando você abre o editor de novo. **Baixar** gera o
arquivo `.cena`, e **Abrir** lê um de volta.

O `.cena` é texto, e uma peça é uma linha — mover uma peça muda uma linha do arquivo:

```jsonc
// Faísca — cena.
// Texto legível de propósito: um "git diff" mostra o que mudou na fase.
{
  "faisca": "0.1",
  "cena": "Fase 1",
  "nos": [
    { "id": "n4", "nome": "Ponto de Partida", "peca": "inicio", "pos": [0, 0, 2] },
    { "id": "n7", "nome": "Rampa", "peca": "rampa", "pai": "n1", "pos": [0, 0, 20] }
  ]
}
```

O leitor aceita comentário e vírgula sobrando, porque é isso que gente escreve ao editar
um arquivo na mão.

### Os controles do jogo

| | Controle de Xbox | Teclado e mouse |
|---|---|---|
| Andar | analógico esquerdo | `WASD` ou setas |
| Olhar | analógico direito | mouse (clique na tela para travar o ponteiro) |
| Pular | `A` | `espaço` |

O controle é lido por **ação**, nunca por tecla: o jogo pergunta "o jogador quer pular?",
e não "o botão A está apertado?". É isso que vai permitir o remapeamento total que a
seção 13 do plano promete, e é isso que faz o mesmo jogo funcionar no controle e no
teclado sem mudar uma linha.

## A cena de referência

`npm run playground` abre a cena que mede performance. Ela não é bonita de propósito: é
feita das mesmas peças que uma fase de verdade vai usar, para medir o que importa. Um
bonequinho que se dirige, uma câmera que segue, e milhares de anéis **instanciados**
(todos numa chamada de desenho só), movidos pelo ECS em passo fixo, com o orçamento da
seção 3 do plano medido a cada quadro:

- **verde** é folga, **amarelo** é no limite, **vermelho** estourou;
- os botões somam anéis até a máquina reclamar — o veredito mostra quantos ela sustenta a 60 fps;
- a **qualidade adaptativa** baixa a escala de renderização sozinha quando o quadro estoura,
  e sobe de volta quando sobra folga.

O mesmo painel aparece no editor, no canto da viewport.

## Estrutura

```
packages/runtime/       # a engine: ECS, laço, entrada, render, orçamento
  src/ecs/              # entidades, componentes em arrays contíguos, visões, sistemas
  src/loop/             # laço de passo fixo, pausa e passo-a-passo, medidor de orçamento
  src/input/            # ações, mapeamento de controles, gamepad de Xbox
  src/render/           # renderizador, qualidade adaptativa, instancing
  src/scene/            # Transform, Velocity e os sistemas de fundação
  src/debug/            # painel de performance
packages/kit-velocidade/  # o coração Sonic: personagem veloz e câmera que segue
packages/autoria/       # documento de cena, formato .cena, peças, desfazer, montador
apps/editor/            # o editor: viewport, árvore, inspetor, peças, teste ao vivo
apps/playground/        # a cena de referência que mede a máquina
docs/PLANO.md           # o contrato do projeto
```

A regra de ouro das camadas vale desde já: **cada camada só conhece a de baixo.** A
autoria conhece o kit e o runtime; o runtime não sabe que a autoria existe, nem que o
editor existe. É o runtime que vai dentro do jogo publicado.

Na prática, é isso que faz o editor ter um miolo (`apps/editor/src/editor.ts`) que não
depende de React: a interface é uma casca em cima dele. O perfil Criança da M12 vai ser
outra casca, e não um segundo editor.

## Orçamento de performance no CI

O plano manda verificar o orçamento a cada mudança, desde o M0. O que dá para cobrar sem
placa de vídeo — o custo de CPU por passo fixo, com uma fase cheia de objetos — roda em
`npm test` e falha a build se estourar os 4 ms de lógica. O lado da GPU (chamadas de
desenho, triângulos, tempo de render) é medido ao vivo pelo painel, que é onde ele pode
ser medido de verdade.

## Licença

MIT
