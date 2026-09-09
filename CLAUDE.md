# Faísca — guia de trabalho e política de custo

Engine de jogos 2D/3D em TypeScript, monorepo npm workspaces.
Este arquivo é lido no início de toda sessão. Ele existe para que o agente
**não gaste tokens redescobrindo o repositório** e saiba, em cada tipo de
tarefa, qual modelo e qual nível de raciocínio usar.

## Mapa do repositório (não precisa explorar de novo)

- `packages/runtime` — laço do jogo, física, orçamento de performance.
- `packages/blocos`, `autoria` — modelo de autoria (blocos, projeto).
- `packages/assets` — importação (formato, hash, dependências de um glTF), `kit-inicial`.
- `packages/interface` — telas 2D e menus (M9).
- `packages/kit-brinquedos`, `kit-inimigos`, `kit-velocidade` — kits de conteúdo.
- `apps/editor` (Vite+React), `apps/playground` (cena de referência), `apps/portal`.
- `scripts/montar-site.mjs` → `site/`; `.github/workflows/ci.yml` roda tipos, testes e build.
- Node >= 20.19. Testes: vitest, `packages/*/test/**/*.test.ts`, fork único (o
  orçamento mede tempo real — **nunca** paralelizar nem rodar junto com build).

## Verificação econômica (ordem obrigatória)

| Nível | Quando | Comando | Custo de saída |
|---|---|---|---|
| 1 | depois de qualquer edição | `npm run verificar:tipos` | ~0 linhas se passar |
| 2 | pacote alterado | `npx vitest run packages/<pkg> --reporter dot` | mínimo |
| 3 | antes de commit/push | `npm run verificar` | tipos + suíte em `dot` |
| 4 | só se mexeu em `apps/*` | `npm run build` | alto — evitar sem motivo |

Regras: nunca rodar nível 4 "por garantia"; nunca rodar a suíte inteira em
reporter verbose (use `npm run orcamento` só quando o alvo for performance);
nunca reexecutar um teste que já passou no mesmo commit.

## Roteamento de modelo e nível de raciocínio

Escolha pelo **risco de errar**, não pelo tamanho do texto. Se a ação estiver
entre duas linhas, comece na mais barata e só suba se ela falhar uma vez.

| Ação | Modelo | Raciocínio | Por quê |
|---|---|---|---|
| Ler/localizar arquivo, `grep`, listar, resumir saída de comando | Haiku 4.5 | nenhum | trabalho mecânico, erro é barato e visível |
| Rodar tipos/testes e reportar o resultado | Haiku 4.5 | nenhum | a saída do comando é a verdade |
| Edição mecânica: renomear, texto, versão, doc curto, ajuste de lint | Haiku 4.5 | baixo | padrão já existe no arquivo |
| Feature localizada (1–3 arquivos, seguindo padrão existente) | Sonnet 5 | médio | precisa de contexto, não de invenção |
| Correção de CI vermelho / bug reproduzível | Sonnet 5 | médio | 1 ciclo; se não resolver, sobe pra Opus |
| Revisão de código, bug sutil, física/tempo do `runtime`, orçamento estourado | Opus 5 | alto | erro aqui só aparece em produção |
| API pública, refatoração entre pacotes, decisão de arquitetura | Opus 5 | máximo | custo de reverter é enorme |
| Resposta de conversa, status, plano curto | modelo da sessão | nenhum | não gastar raciocínio em prosa |

Nunca subir de modelo sem um sintoma concreto (teste falhou, revisão apontou,
diagnóstico não fechou). "Parece complexo" não é sintoma.

## Regras de economia de token

1. Ler por faixa (`sed -n '40,90p'`), nunca arquivo inteiro acima de ~300 linhas.
2. Buscar com `grep -n ... | head`, nunca despejar resultados.
3. Agrupar comandos independentes numa única chamada de shell.
4. Não reler arquivo depois de editar — se a edição falhasse, o comando teria dado erro.
5. Não abrir subagente para o que dá pra fazer direto: cada subagente começa
   do zero e repaga todo o contexto deste arquivo.
6. Não repetir o diff na resposta; dizer o que mudou e onde (`arquivo:linha`).
7. Uma verificação validada antes do push vale mais que três pushes especulativos.
8. Auto-compact fecha a janela em 1M tokens (`.claude/settings.json`,
   chave `autoCompactWindow`). Sessão longa resume sozinha antes de encher.
