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

**M0 entregue:** o esqueleto do runtime roda. Uma janela 3D abre, o laço de passo fixo
gira, e o painel de performance responde a pergunta que o M0 existe para responder —
*esta máquina aguenta 60 fps?* — com número na mão.

Próxima fatia: **M1** — personagem controlável, câmera que segue e gamepad de Xbox.

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

### A cena de referência

Ela não é bonita de propósito: é feita das mesmas peças que uma fase de verdade vai usar,
para medir o que importa. Milhares de anéis **instanciados** (todos numa chamada de
desenho só), movidos pelo ECS em passo fixo, com o orçamento da seção 3 do plano medido
a cada quadro:

- **verde** é folga, **amarelo** é no limite, **vermelho** estourou;
- os botões somam anéis até a máquina reclamar — o veredito mostra quantos ela sustenta a 60 fps;
- a **qualidade adaptativa** baixa a escala de renderização sozinha quando o quadro estoura,
  e sobe de volta quando sobra folga.

## Estrutura

```
packages/runtime/     # a engine: ECS, laço, render, orçamento. Roda sem o editor.
  src/ecs/            # entidades, componentes em arrays contíguos, visões, sistemas
  src/loop/           # laço de passo fixo e medidor de orçamento
  src/render/         # renderizador, qualidade adaptativa, instancing
  src/scene/          # Transform, Velocity e os sistemas de fundação
  src/debug/          # painel de performance
apps/playground/      # a cena de referência que abre no navegador
docs/PLANO.md         # o contrato do projeto
```

A regra de ouro das camadas vale desde já: **o runtime não sabe que o editor existe.**
É ele que vai dentro do jogo publicado.

## Orçamento de performance no CI

O plano manda verificar o orçamento a cada mudança, desde o M0. O que dá para cobrar sem
placa de vídeo — o custo de CPU por passo fixo, com uma fase cheia de objetos — roda em
`npm test` e falha a build se estourar os 4 ms de lógica. O lado da GPU (chamadas de
desenho, triângulos, tempo de render) é medido ao vivo pelo painel da cena de referência,
que é onde ele pode ser medido de verdade.

## Licença

MIT
