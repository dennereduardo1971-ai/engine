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

Em planejamento. Primeira fatia de código: esqueleto do runtime (M0).

## Licença

MIT
