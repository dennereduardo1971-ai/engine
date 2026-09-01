import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './estilo.css';

/**
 * Sem StrictMode de proposito: em desenvolvimento ele monta e desmonta cada
 * efeito duas vezes, e isso criaria e jogaria fora um contexto WebGL a cada
 * recarga — caro justamente na maquina modesta que o plano tem como alvo.
 */
createRoot(document.querySelector('#raiz')!).render(<App />);
