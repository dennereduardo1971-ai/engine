/**
 * Monta o site publicado: a página de entrada, o editor e a cena de referência.
 *
 * O GitHub Pages serve um repositório dentro de uma subpasta
 * (`/engine/editor/`), e não na raiz de um domínio. Por isso os dois apps são
 * empacotados com caminhos relativos, e este script só os põe lado a lado
 * numa pasta que o Pages sabe publicar inteira.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = path.join(raiz, 'site');

function rodar(comando) {
  console.log(`\n> ${comando}`);
  execSync(comando, { cwd: raiz, stdio: 'inherit' });
}

rodar('npm run build --workspace @faisca/editor');
rodar('npm run build --workspace @faisca/playground');

fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(saida, { recursive: true });

fs.cpSync(path.join(raiz, 'apps/editor/dist'), path.join(saida, 'editor'), { recursive: true });
fs.cpSync(path.join(raiz, 'apps/playground/dist'), path.join(saida, 'jogar'), { recursive: true });
fs.copyFileSync(path.join(raiz, 'apps/portal/index.html'), path.join(saida, 'index.html'));

// Sem isto o Pages roda o Jekyll em cima da pasta e come tudo que começa com
// sublinhado — que é como o Vite às vezes nomeia pedaço de bundle.
fs.writeFileSync(path.join(saida, '.nojekyll'), '');

function tamanho(pasta) {
  let total = 0;
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const alvo = path.join(pasta, item.name);
    total += item.isDirectory() ? tamanho(alvo) : fs.statSync(alvo).size;
  }
  return total;
}

console.log(`\nSite montado em site/ — ${(tamanho(saida) / 1048576).toFixed(1)} MB`);
