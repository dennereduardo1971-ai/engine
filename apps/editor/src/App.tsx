import { useEffect, useRef, useState } from 'react';
import { Editor } from './editor.ts';
import { Arvore } from './ui/Arvore.tsx';
import { Assets } from './ui/Assets.tsx';
import { Barra } from './ui/Barra.tsx';
import { Inspetor } from './ui/Inspetor.tsx';
import { Pecas } from './ui/Pecas.tsx';
import { Pista } from './ui/Pista.tsx';
import { Programar } from './ui/Programar.tsx';
import { Telas } from './ui/Telas.tsx';

/**
 * O editor v0 da Faisca (M3).
 *
 * A interface e React, como o plano decidiu, mas ela e so a casca: quem sabe
 * editar e a classe `Editor`, e quem sabe o que a fase e e a camada de
 * autoria. E por isso que um perfil Crianca, mais para frente, e outra casca
 * em cima do mesmo miolo, e nao um segundo editor.
 */
export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [, setVersao] = useState(0);

  useEffect(() => {
    if (!canvas.current || !palco.current) return;
    const criado = new Editor(canvas.current, palco.current);
    setEditor(criado);
    // A engine a mao no console do navegador, para mexer ao vivo.
    Object.assign(globalThis, { faisca: criado });
    return () => criado.dispose();
  }, []);

  // Um unico redesenho por quadro, mesmo com o documento avisando sessenta
  // vezes por segundo durante um arrasto.
  useEffect(() => {
    if (!editor) return;
    let agendado = 0;
    const solta = editor.on(() => {
      if (agendado) return;
      agendado = requestAnimationFrame(() => {
        agendado = 0;
        setVersao((v) => v + 1);
      });
    });
    return () => {
      solta();
      if (agendado) cancelAnimationFrame(agendado);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const aoTeclar = (event: KeyboardEvent) => atalho(editor, event);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [editor]);

  return (
    <div className="app">
      {editor ? <Barra editor={editor} /> : <header className="barra" />}
      <div className="corpo">
        <aside className="lado esquerda">
          {editor ? (
            <>
              <Pista editor={editor} />
              <Pecas editor={editor} />
              <Assets editor={editor} />
              <Arvore editor={editor} />
              <Telas editor={editor} />
            </>
          ) : null}
        </aside>

        <div className="palco" ref={palco}>
          <canvas ref={canvas} />
          {editor ? <Programar editor={editor} /> : null}
          <div className="teclas">
            <b>botão esquerdo</b> seleciona e arrasta · <b>direito</b> gira a câmera ·{' '}
            <b>meio</b> arrasta a vista · <b>roda</b> aproxima · <b>R</b> gira 45° ·{' '}
            <b>Del</b> apaga · <b>Ctrl+D</b> duplica · <b>Ctrl+Z</b> desfaz
          </div>
        </div>

        <aside className="lado direita">{editor ? <Inspetor editor={editor} /> : null}</aside>
      </div>
    </div>
  );
}

/**
 * Atalhos de teclado.
 *
 * Nenhum deles dispara enquanto o foco esta num campo: digitar "Reta A" no
 * nome nao pode apagar a peca no "A" nem girar no "R".
 */
function atalho(editor: Editor, event: KeyboardEvent): void {
  const alvo = event.target as HTMLElement | null;
  const etiqueta = alvo?.tagName;
  if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT') return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) editor.redo();
    else editor.undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    editor.redo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    editor.duplicateSelection();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  switch (event.key) {
    case 'Delete':
    case 'Backspace':
      event.preventDefault();
      editor.deleteSelection();
      break;
    case 'r':
    case 'R':
      editor.rotateSelection(event.shiftKey ? -45 : 45);
      break;
    case 'PageUp':
      event.preventDefault();
      editor.nudgeHeight(editor.snap ? editor.grid : 0.5);
      break;
    case 'PageDown':
      event.preventDefault();
      editor.nudgeHeight(-(editor.snap ? editor.grid : 0.5));
      break;
    case 'Escape':
      if (editor.mode === 'jogar') editor.stop();
      else if (editor.brush) editor.setBrush(null);
      else editor.select(null);
      break;
    default:
      break;
  }
}
