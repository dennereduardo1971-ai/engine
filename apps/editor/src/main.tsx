import { createRoot } from 'react-dom/client';
import { loadRapier } from '@faisca/runtime';
import { App } from './App.tsx';
import './estilo.css';

/**
 * Sem StrictMode de proposito: em desenvolvimento ele monta e desmonta cada
 * efeito duas vezes, e isso criaria e jogaria fora um contexto WebGL a cada
 * recarga — caro justamente na maquina modesta que o plano tem como alvo.
 */
// O wasm do Rapier carrega antes da primeira engine existir: o construtor da
// engine e sincrono, e nao pode esperar por ele.
await loadRapier();

createRoot(document.querySelector('#raiz')!).render(<App />);
