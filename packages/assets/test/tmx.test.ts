import { describe, expect, it } from 'vitest';
import { validarTmx } from '../src/index.ts';

function bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

const TMX_VALIDO =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<map version="1.10" tilewidth="16" tileheight="16" width="20" height="15"></map>';

describe('validarTmx', () => {
  it('aceita um TMX bem formado', () => {
    expect(() => validarTmx(bytes(TMX_VALIDO))).not.toThrow();
  });

  it('recusa um arquivo sem a tag "<map>"', () => {
    expect(() => validarTmx(bytes('<xml></xml>'))).toThrow(/não encontrei a tag/);
  });

  it('recusa uma tag "<map>" sem um atributo obrigatorio', () => {
    expect(() => validarTmx(bytes('<map tilewidth="16" tileheight="16" width="20"></map>'))).toThrow(
      /falta o atributo "height"/,
    );
  });
});
