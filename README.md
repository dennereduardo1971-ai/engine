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

**M0 e M1 entregues.** Uma janela 3D abre, o laço de passo fixo gira, e o painel de
performance responde a pergunta do M0 — *esta máquina aguenta 60 fps?* — com número na
mão. E tem um bonequinho que anda com o controle de Xbox, com câmera que segue sozinha.

Próxima fatia: **M2** — Rapier: gravidade, rampas, momentum e superfície grudenta. É onde
o loop-the-loop aparece.

## Como rodar

Precisa de Node 20.19 ou mais novo.

```bash
npm install
npm run dev      # abre a cena de referência em http://localhost:5173
```

Outros comandos:

```bash
npm test         # testes do ECS, do laço e o orçamento de performance
npm run orcamento  # só o orçamento, com os números medidos
npm run typecheck
npm run build    # empacota a cena de referência
```

### Os controles

| | Controle de Xbox | Teclado e mouse |
|---|---|---|
| Andar | analógico esquerdo | `WASD` ou setas |
| Olhar | analógico direito | mouse (clique na tela para travar o ponteiro) |
| Pular | `A` | `espaço` |

O controle é lido por **ação**, nunca por tecla: o jogo pergunta "o jogador quer pular?",
e não "o botão A está apertado?". É isso que vai permitir o remapeamento total que a
seção 13 do plano promete, e é isso que faz o mesmo jogo funcionar no controle e no
teclado sem mudar uma linha.

### A cena de referência

Ela não é bonita de propósito: é feita das mesmas peças que uma fase de verdade vai usar,
para medir o que importa. Um bonequinho que se dirige, uma câmera que segue, e milhares
de anéis **instanciados** (todos numa chamada de desenho só), movidos pelo ECS em passo
fixo, com o orçamento da seção 3 do plano medido a cada quadro:

- **verde** é folga, **amarelo** é no limite, **vermelho** estourou;
- os botões somam anéis até a máquina reclamar — o veredito mostra quantos ela sustenta a 60 fps;
- a **qualidade adaptativa** baixa a escala de renderização sozinha quando o quadro estoura,
  e sobe de volta quando sobra folga.

## Estrutura

```
packages/runtime/       # a engine: ECS, laço, entrada, render, orçamento
  src/ecs/              # entidades, componentes em arrays contíguos, visões, sistemas
  src/loop/             # laço de passo fixo e medidor de orçamento
  src/input/            # ações, mapeamento de controles, gamepad de Xbox
  src/render/           # renderizador, qualidade adaptativa, instancing
  src/scene/            # Transform, Velocity e os sistemas de fundação
  src/debug/            # painel de performance
packages/kit-velocidade/  # o coração Sonic: personagem veloz e câmera que segue
apps/playground/        # a cena de referência que abre no navegador
docs/PLANO.md           # o contrato do projeto
```

A regra de ouro das camadas vale desde já: **cada camada só conhece a de baixo.** O kit
conhece o runtime; o runtime não sabe que o kit existe, nem que o editor existe. É o
runtime que vai dentro do jogo publicado.

## Orçamento de performance no CI

O plano manda verificar o orçamento a cada mudança, desde o M0. O que dá para cobrar sem
placa de vídeo — o custo de CPU por passo fixo, com uma fase cheia de objetos — roda em
`npm test` e falha a build se estourar os 4 ms de lógica. O lado da GPU (chamadas de
desenho, triângulos, tempo de render) é medido ao vivo pelo painel da cena de referência,
que é onde ele pode ser medido de verdade.

## Licença

MIT
