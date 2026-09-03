import { describe, expect, it } from 'vitest';
import { acharPerfil, PERFIL_PADRAO, PERFIS, perfilValido } from '../src/index.ts';

/**
 * Os quatro perfis da secao 8 do plano.
 *
 * O que estes testes protegem nao e a lista, e a **ordem**: cada perfil mostra
 * tudo que o anterior mostra, e mais alguma coisa. Se um dia alguem esconder
 * do Programador algo que o Design ve, a promessa de "mesma engine, interfaces
 * diferentes" vira "quatro editores diferentes" — e o teste avisa.
 */
describe('perfis de interface', () => {
  it('existem os quatro que o plano lista', () => {
    expect(PERFIS.map((perfil) => perfil.id)).toEqual([
      'crianca',
      'design',
      'criador',
      'programador',
    ]);
  });

  it('o perfil Design nao mostra codigo nem blocos, e mostra regras', () => {
    const design = acharPerfil('design');
    expect(design.mostra).toEqual({
      regras: true,
      blocos: false,
      codigo: false,
      depuracao: false,
      performance: false,
    });
  });

  it('cada perfil mostra tudo do anterior, e mais', () => {
    const ordem = ['design', 'criador', 'programador'] as const;
    for (let i = 1; i < ordem.length; i++) {
      const antes = acharPerfil(ordem[i - 1]).mostra;
      const depois = acharPerfil(ordem[i]).mostra;
      for (const chave of Object.keys(antes) as (keyof typeof antes)[]) {
        if (antes[chave]) expect(depois[chave]).toBe(true);
      }
    }
  });

  it('o Programador ve tudo', () => {
    const tudo = acharPerfil('programador').mostra;
    expect(Object.values(tudo).every(Boolean)).toBe(true);
  });

  it('o Modo Criança já dá para escolher, e é o único com jeito próprio (M12)', () => {
    const crianca = acharPerfil('crianca');
    expect(crianca.disponivel).toBe(true);
    expect(perfilValido('crianca')).toBe('crianca');
    expect(crianca.jeito).toEqual({ botoesGrandes: true, narracao: true, confirmaApagar: true });

    // "O que aparece" e "de que jeito" sao perguntas separadas: o Modo Crianca
    // mostra exatamente o mesmo que o Design, e mesmo assim e outra interface.
    expect(crianca.mostra).toEqual(acharPerfil('design').mostra);
    for (const outro of PERFIS.filter((perfil) => perfil.id !== 'crianca')) {
      expect(Object.values(outro.jeito).some(Boolean)).toBe(false);
    }
  });

  it('perfil salvo que nao existe mais nao quebra o editor', () => {
    expect(perfilValido('inventado')).toBe(PERFIL_PADRAO);
    expect(perfilValido(null)).toBe(PERFIL_PADRAO);
    expect(perfilValido('design')).toBe('design');
  });

  it('achar um perfil desconhecido devolve o padrao, e nao null', () => {
    expect(acharPerfil('nada').id).toBe(PERFIL_PADRAO);
  });
});
