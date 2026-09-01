import { useEffect, useState, type KeyboardEvent } from 'react';

/**
 * Campos do inspetor.
 *
 * Duas coisas chatas ficam resolvidas aqui, num lugar so:
 *
 * 1. Teclado. O jogo escuta o teclado na janela inteira. Sem parar a tecla
 *    aqui, digitar "Reta A" no nome faria o personagem andar, e apertar
 *    espaco o faria pular.
 * 2. Campo pela metade. Um numero controlado que reescreve o que a pessoa
 *    digitou nao deixa apagar para trocar o valor: "12" vira "1", que ja
 *    volta como 1. Enquanto o campo tem foco, quem manda e o texto digitado.
 */
export const pararTeclas = {
  onKeyDown: (event: KeyboardEvent) => event.stopPropagation(),
  onKeyUp: (event: KeyboardEvent) => event.stopPropagation(),
};

function formatar(valor: number): string {
  return String(Math.round(valor * 1000) / 1000);
}

export interface NumeroProps {
  valor: number;
  onChange(valor: number): void;
  step?: number;
  min?: number;
  max?: number;
  titulo?: string;
}

export function Numero({ valor, onChange, step = 0.1, min, max, titulo }: NumeroProps) {
  const [texto, setTexto] = useState(() => formatar(valor));
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!editando) setTexto(formatar(valor));
  }, [valor, editando]);

  return (
    <input
      className="numero"
      type="number"
      title={titulo}
      value={texto}
      step={step}
      min={min}
      max={max}
      onFocus={() => setEditando(true)}
      onBlur={() => {
        setEditando(false);
        setTexto(formatar(valor));
      }}
      onChange={(event) => {
        setTexto(event.target.value);
        const numero = Number(event.target.value);
        if (event.target.value !== '' && Number.isFinite(numero)) onChange(numero);
      }}
      {...pararTeclas}
    />
  );
}

export interface DeslizadorProps extends NumeroProps {
  rotulo: string;
  unidade?: string;
  ajuda?: string;
}

/** Deslizador com o numero do lado: arrastar para sentir, digitar para acertar. */
export function Deslizador({ rotulo, unidade, ajuda, ...props }: DeslizadorProps) {
  return (
    <label className="deslizador" title={ajuda}>
      <span className="rotulo">
        {rotulo}
        {unidade ? <em>{unidade}</em> : null}
      </span>
      <span className="controles">
        <input
          type="range"
          value={props.valor}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(event) => props.onChange(Number(event.target.value))}
          {...pararTeclas}
        />
        <Numero {...props} />
      </span>
    </label>
  );
}

export interface TextoProps {
  valor: string;
  onChange(valor: string): void;
  placeholder?: string;
}

export function Texto({ valor, onChange, placeholder }: TextoProps) {
  return (
    <input
      className="texto"
      type="text"
      value={valor}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      {...pararTeclas}
    />
  );
}
