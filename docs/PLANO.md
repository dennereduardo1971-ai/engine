# Faísca — Plano da Engine

> Uma engine de jogos 2D/3D feita para uma família criar jogos junto.
> Documento vivo. Versão 1 do plano, fechada a partir de 20 rodadas de definição.

---

## 1. Visão

**Faísca** é uma engine de jogos onde:

- **O pai programa pouco** — então blocos visuais e nós são a via principal, e o código é um escape opcional, nunca uma obrigação.
- **A mãe cria sem código** — e consegue montar uma fase, colocar inimigos, escrever diálogos, fazer o menu e publicar o jogo, do começo ao fim, sozinha.
- **O filho joga hoje e cria amanhã** — com um Modo Criança de botões grandes, ícones, narração por voz e nada que quebre o projeto.
- **O jogo de referência é um Sonic 3D**: velocidade, momentum, loops, molas, rails e anéis. Esse é o gênero mais difícil que existe, e por isso ele é o coração da engine, não um extra.

Lema técnico: **60 fps num i5 com gráficos Intel integrados e 8 GB de RAM.** Se não roda ali, não entra.

---

## 2. Decisões fechadas

### Produto
| Assunto | Decisão |
|---|---|
| Licença / abertura | Open source, licença MIT |
| Gêneros-alvo | 3D estilo Sonic (pista com caminhos alternativos) + jogos interativos de física e de diálogo/puzzle |
| Tamanho de um jogo | Médio: 8–12 fases, 1–2 h, hub 3D, progressão, saves |
| Idiomas | PT-BR primeiro, EN em seguida |
| Plataformas do jogo | Navegador + desktop (Windows/Linux/Mac), Android depois |
| Plataforma do editor | Navegador, empacotável como app desktop, **offline-first** |
| Controles | Gamepad de Xbox em primeiro lugar, mais teclado+mouse e touch |
| Telemetria | Zero. Nenhum dado sai da máquina sem ação explícita. |

### Técnicas
| Assunto | Decisão | Por quê |
|---|---|---|
| Linguagem do núcleo | **TypeScript** | Hot reload instantâneo, sem espera de compilação num PC de 8 GB |
| Renderização | **Three.js**, WebGL2 como padrão, WebGPU ligado automaticamente quando confiável | Chip Intel integrado roda WebGL2 de forma muito mais previsível |
| Física | **Rapier** (Rust compilado para WebAssembly), 2D e 3D | Velocidade de Rust exatamente onde ela importa, sem custo de compilação para nós |
| Arquitetura interna | **ECS** por baixo, **árvore de objetos** amigável por cima | Performance de ECS, mentalidade simples de "objetos numa cena" |
| 2D e 3D | Um único renderizador (2D = 3D ortográfico) | Permite misturar sprites dentro de cenas 3D |
| UI do editor | React + Vite | Ecossistema maduro, empacota como desktop via Tauri |
| Formato do projeto | Pasta de arquivos de texto legíveis + cache binário derivado | Bom para Git, para diffs e para IA editar |
| Nuvem | Supabase (projetos, saves, links de publicação) | Já disponível para a família |
| Colaboração ao vivo | CRDT (Yjs) desde a fundação do modelo de dados | Retrofit de CRDT depois é reescrita; agora é barato |

> **Mudança em relação ao rascunho inicial:** o núcleo em Rust+WebAssembly foi descartado. O gargalo real do hardware da família é a GPU integrada, não a CPU — Rust custaria minutos de compilação a cada mudança e ganharia quase nada. A performance de Rust entra pela porta certa: Rapier.

---

## 3. Orçamento de performance

Máquina de referência (a máquina da casa): **Intel Core i5, gráficos Intel integrados, 8 GB de RAM.**

| Métrica | Meta | Teto duro |
|---|---|---|
| Resolução | 720p | escala dinâmica até 540p antes de perder fps |
| Quadro | 16,6 ms (60 fps) | nunca acima de 20 ms |
| — lógica + ECS | 4 ms | |
| — física | 3 ms | |
| — render | 8 ms | |
| Chamadas de desenho | 300 | 600 |
| Triângulos visíveis | 250 mil | 500 mil |
| RAM do jogo | 400 MB | 700 MB |
| RAM do editor | 700 MB | 1,2 GB |
| Download de um jogo publicado | 15 MB | 25 MB |

**Como as metas são mantidas:**
- **Qualidade adaptativa automática.** Um supervisor mede o tempo de quadro e desliga em ordem: sombras distantes → densidade de partículas → resolução de renderização → qualidade de sombra → pós-processamento. Sobe de novo quando sobra folga.
- **Modo leve do editor.** Quando o jogo está em teste, o editor reduz seu próprio custo (para de redesenhar painéis, baixa a taxa da viewport de edição) e dá prioridade ao jogo.
- **Orçamento verificado em CI.** Uma cena de referência roda num teste automático a cada mudança; se o tempo de quadro estourar, a mudança não entra.
- **Instancing e atlas por padrão.** Anéis, árvores e peças de pista repetidas viram uma chamada de desenho só.

---

## 4. Arquitetura em camadas

```
┌──────────────────────────────────────────────────────┐
│  Perfis de interface                                 │
│  Criança · Design · Criador · Programador            │
├──────────────────────────────────────────────────────┤
│  Editor (React)                                      │
│  cena · inspetor · blocos · nós · pista · timeline   │
│  interface · assets · teste ao vivo · assistente IA  │
├──────────────────────────────────────────────────────┤
│  Camada de autoria                                   │
│  blocos ⇄ TypeScript (mesma árvore) · peças · undo   │
│  documento CRDT (Yjs) · watcher de assets            │
├──────────────────────────────────────────────────────┤
│  Kits de jogo                                        │
│  Velocidade (Sonic) · Física-brinquedo · Diálogo     │
│  Inimigos · Chefes · Interativos · HUD               │
├──────────────────────────────────────────────────────┤
│  Runtime (núcleo)                                    │
│  ECS · cena · scripting · entrada · áudio · save     │
├──────────────────────────────────────────────────────┤
│  Base                                                │
│  Three.js (WebGL2/WebGPU) · Rapier (wasm) · WebAudio │
└──────────────────────────────────────────────────────┘
```

Regra de ouro: **cada camada só conhece a de baixo.** O runtime roda sem o editor (é ele que vai dentro do jogo publicado, e pesa poucos megabytes).

---

## 5. Formato do projeto

```
MeuJogo/
  jogo.faisca           # manifesto: nome, ícone, config, versão
  cenas/
    fase-01.cena        # texto legível (JSON5 comentado)
    hub.cena
  pecas/                # objetos reutilizáveis entre projetos
    inimigo-patrulheiro.peca
    plataforma-movel.peca
  scripts/
    inimigo.blocos      # árvore de blocos
    inimigo.ts          # o MESMO script, visto como código
  assets/
    modelos/ texturas/ sons/ musicas/ fontes/
  interface/
    menu-principal.ui
  .faisca/              # cache derivado — não vai para o Git
```

Tudo em texto. Um `git diff` mostra "mudou a velocidade do inimigo de 3 para 5", não um blob binário.

---

## 6. Modelo de dados: ECS com cara de árvore

Por baixo, componentes em arrays contíguos (rápido de percorrer). Por cima, o editor mostra:

```
Fase 1
├─ Sonic          (Personagem Veloz, Câmera Alvo)
├─ Pista
│  ├─ Reta A      (Malha, Colisor)
│  ├─ Loop        (Malha, Colisor, Superfície Grudenta)
│  └─ Rampa       (Malha, Colisor)
├─ Anéis (x50)    (instanciado — 1 chamada de desenho)
└─ Inimigos
   └─ Patrulheiro (Inimigo Patrulheiro, Vida)
```

Componentes têm nomes em português na interface e em inglês no código. `Personagem Veloz` ⇄ `SpeedCharacter`.

---

## 7. Programação: blocos e código são a mesma coisa

Esta é a decisão mais importante do projeto.

Blocos e TypeScript não são dois sistemas que se convertem um no outro — são **duas visualizações da mesma árvore sintática**. Você clica em "ver como código", edita uma linha, volta para blocos, e o bloco mudou. Nada se perde no caminho.

```
[quando o jogador encostar em mim]          on(Toque, (jogador) => {
  [tocar som "mola.ogg"]           ⇄          tocarSom("mola.ogg");
  [empurrar jogador para cima 20]             empurrar(jogador, CIMA, 20);
                                            });
```

- **Nós (grafo)** são a terceira visão, boa para lógica de fase e cutscenes.
- **Gatilho e resposta**: "quando o jogador entra aqui → abre a porta e toca som", montado só apontando e clicando. É o coração do perfil Design.
- **Erros em português**, com o bloco culpado destacado e uma correção sugerida: *"O inimigo não tem Vida. Quer que eu adicione?"* → [Sim]
- **Console ao vivo** durante o teste: `vidas 10`, `ir fase 3`, `voar`.
- **Peças** (prefabs + comportamento) são exportáveis e reutilizáveis entre todos os jogos da família.
- **Assistente de IA** no editor gera blocos a partir de uma frase. A arquitetura fica pronta na v1; o recurso liga quando vocês quiserem, e a engine funciona 100% sem ele.

---

## 8. O editor

**Quatro perfis**, trocáveis a qualquer momento — mesma engine, interfaces diferentes:

| Perfil | Para quem | O que mostra |
|---|---|---|
| **Criança** | O filho | Botões grandes, ícones, narração por voz, nada destrutivo sem confirmação, "Modo Brincar de Criar" |
| **Design** | A esposa | Cena, peças, cores, luz, diálogos, interface, gatilho-e-resposta, publicar. Zero código visível. |
| **Criador** | Você | Tudo de Design + blocos e nós |
| **Programador** | Você, depois | Tudo + código, console, inspetor de performance |

**Teste ao vivo:** play, pause, passo-a-passo e **rebobinar 5 segundos**. Hot reload é prioridade máxima — mudar um valor e ver o efeito sem reiniciar a fase.

**Tema:** escuro moderno de estúdio; o Modo Criança é claro e colorido.

---

## 9. Kit Velocidade — o coração Sonic

O controlador de personagem é o sistema mais caro e mais importante da engine.

**Modelo de movimento:**
- Velocidade **ao longo da superfície**, não no plano do mundo. O personagem tem um "para cima" próprio, que se alinha à normal do chão — é isso que faz loops, paredes e corkscrews funcionarem.
- Aceleração, atrito, atrito de derrapagem, velocidade máxima no chão, no ar e rolando: todos deslizadores no inspetor.
- Gravidade que só puxa para fora da superfície quando a velocidade cai abaixo do limite de aderência — o momento exato em que Sonic despenca do loop se estiver devagar.
- Rolar ganha velocidade descendo e perde subindo.

**Brinquedos de pista:** molas, aceleradores, rails de grind, canhões, loop-the-loop, corkscrew, wall run, homing attack, anéis, checkpoints. (Nado fica fora da v1.)

**Câmera:** segue a pista automaticamente, com liberdade parcial no analógico. Abre o campo de visão ao acelerar. Sem enjoo, sem frustração.

**Efeitos de velocidade:** rastro, distorção da lente, linhas de vento — todos com um clique.

**Construção de fase, três ferramentas:**
1. **Spline de pista** (o carro-chefe) — você desenha uma linha no espaço, ela vira estrada com largura, inclinação e loops, com colisão gerada automaticamente.
2. **Peças modulares** que encaixam numa grade, com rotação em ângulos fixos.
3. **Terreno esculpível** para o entorno.
Mais o **pincel de espalhar**: pinte árvores, anéis e inimigos.

---

## 10. Outros kits

- **Física-brinquedo** — caixas que quebram, objetos que empurram e empilham, alavancas, portas, plataformas móveis, esteiras, veículos simples.
- **Diálogo e puzzle** — balões de fala, escolhas, inventário, itens, chaves e fechaduras.
- **Inimigos** — patrulheiro, perseguidor, atirador, voador; todos configuráveis sem código.
- **Chefes** — máquina de fases de ataque, montada visualmente.
- **HUD e menus** — editor de interface por arrastar, com temas prontos.
- **Cutscenes** — timeline de câmera, falas e ações.
- **Áudio** — efeitos, música em camadas adaptativas (acelera quando o jogador acelera), áudio espacial 3D, e gravação de voz direto no editor.

---

## 11. Assets

- Importação por arrastar: PNG, Aseprite, glTF/GLB, Blender, Tiled, WAV/OGG.
- **Reimport automático** quando o arquivo muda no disco.
- **Foto de desenho no papel vira sprite** — recorte automático de fundo. (Sim, isso existe para o desenho do filho virar personagem.)
- Compressão agressiva na publicação (KTX2/Basis para texturas, Draco para malhas).
- **Kit inicial próprio** já instalado: personagens, peças de pista, sons e músicas, com licença livre.
- Geração por IA (textura, som, sprite) fica para a v2, sempre opcional.

---

## 12. Colaboração, nuvem e publicação

- **Projetos sincronizados** entre as máquinas da família via Supabase; funciona offline e sincroniza depois.
- **Edição colaborativa em tempo real** (Yjs/CRDT) — os dois no mesmo projeto ao mesmo tempo.
- **Histórico visual** com "voltar no tempo" no editor, e Git de verdade por baixo para quem quiser.
- **Publicar** gera: link web (privado, para mandar para as avós), player desktop com "cartucho" (arquivo único), e APK Android depois.
- **Galeria da família** com capa, vídeo e todos os jogos criados.

---

## 13. Criança, acessibilidade e segurança

- Modo Criança: botões grandes, ícones, **narração por voz** dos menus (ele ainda não lê), confirmação em tudo que apaga.
- **Modo Brincar de Criar**: ele monta fases arrastando peças, sem menus.
- Ajudas de dificuldade ligáveis a qualquer momento: invencibilidade, velocidade reduzida, pulo assistido, "nunca cai no buraco".
- Acessibilidade: paletas para daltonismo, legendas, redução de movimento, remapeamento total de controles.
- Segurança: **zero telemetria**, e jogos publicados **sem acesso à rede por padrão**.

---

## 14. Roadmap

Entrega em fatias. Cada fatia é um pull request, e termina com **algo que vocês abrem no navegador e usam**.

### Mês 1 — Um jogo jogável de verdade
| Fatia | Entrega | Você consegue |
|---|---|---|
| **M0** | Esqueleto: Vite, TS, Three.js, ECS, laço de jogo, contador de fps | Abrir uma janela 3D e confirmar que o PC aguenta |
| **M1** | Personagem controlável, câmera que segue, **gamepad de Xbox** | Andar com um bonequinho usando o controle |
| **M2** | Rapier: gravidade, rampas, momentum, **superfície grudenta** | Correr num loop e sair dele |
| **M3** | Editor v0: viewport, árvore de cena, inspetor, salvar/carregar, hot reload | Montar uma pista com peças e testar na hora |
| **M4** | Anéis, molas, inimigo patrulheiro, meta, HUD, save | **Um jogo completo, do início ao fim** |

### Mês 2 — Autoria de verdade
M5 blocos ⇄ código · M6 gatilho-e-resposta e perfil Design · M7 spline de pista · M8 importação de assets e kit inicial

### Mês 3 — Família
M9 editor de interface e menus · M10 diálogos e cutscenes · M11 publicar link + galeria · M12 Modo Criança com narração

### Depois
Co-op local em tela dividida · nuvem e colaboração ao vivo · nós/grafo · Android · assistente de IA · online privado · 2D completo com tilemap · WebGPU como padrão quando o hardware permitir.

---

## 15. Riscos, com franqueza

| Risco | Gravidade | O que fazemos |
|---|---|---|
| Controlador Sonic é difícil de acertar | Alta | É M2, cedo. Se o "sentir" não vier, sobra tempo para iterar. |
| GPU integrada não aguenta a ambição visual | Alta | Orçamento de performance verificado em CI desde M0. |
| Editor visual é muitíssimo trabalho | Alta | Entregue em fatias finas; cada uma já é usável. |
| Blocos ⇄ código bidirecional é sofisticado | Média | Uma árvore só, nunca duas. Decidido na fundação. |
| Escopo crescer demais | Média | Este documento é o contrato. O que não está aqui é "depois". |
| 8 GB de RAM apertados com editor + jogo | Média | Modo leve do editor, e teto de RAM medido. |

---

## 16. Glossário

**Anel** · o coletável clássico. **Blocos** · programação por peças encaixáveis. **Cena** · uma fase ou tela. **CRDT** · tecnologia que deixa duas pessoas editarem ao mesmo tempo sem conflito. **ECS** · organização interna que separa os dados dos comportamentos, para ir rápido. **Hot reload** · mudar e ver na hora, sem reiniciar. **Peça** · objeto pronto e reutilizável. **Spline** · linha curva que você desenha e vira pista. **Superfície grudenta** · a gravidade que segue o chão e permite loops. **WebGL2 / WebGPU** · as duas formas de o navegador falar com a placa de vídeo.
