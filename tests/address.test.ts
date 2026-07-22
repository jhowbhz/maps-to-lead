import { describe, expect, it } from 'vitest';
import { parseAddressBR } from '../src/parsing/address';

describe('parseAddressBR', () => {
  it('quebra endereço completo com bairro, cidade, UF e CEP', () => {
    const a = parseAddressBR('R. Cel. Benjamim Guimarães, 123 - Centro, Contagem - MG, 32041-260');
    expect(a.street).toBe('R. Cel. Benjamim Guimarães');
    expect(a.number).toBe('123');
    expect(a.neighborhood).toBe('Centro');
    expect(a.city).toBe('Contagem');
    expect(a.uf).toBe('MG');
    expect(a.cep).toBe('32041-260');
    expect(a.full).toContain('Contagem');
  });

  it('funciona sem CEP', () => {
    const a = parseAddressBR('Av. Brasil, 1000 - Savassi, Belo Horizonte - MG');
    expect(a.number).toBe('1000');
    expect(a.neighborhood).toBe('Savassi');
    expect(a.city).toBe('Belo Horizonte');
    expect(a.uf).toBe('MG');
    expect(a.cep).toBe('');
  });

  it('trata "s/n" como número', () => {
    const a = parseAddressBR('Rodovia BR-040, s/n - Zona Rural, Sete Lagoas - MG');
    expect(a.number.toLowerCase()).toBe('s/n');
    expect(a.street).toBe('Rodovia BR-040');
  });

  it('não inventa UF quando a sigla final é inválida', () => {
    const a = parseAddressBR('Rua X, 10 - Centro, Cidade - ZZ');
    expect(a.uf).toBe('');
  });

  it('endereço vazio devolve estrutura vazia', () => {
    const a = parseAddressBR('');
    expect(a).toEqual({ street: '', number: '', neighborhood: '', city: '', uf: '', cep: '', full: '' });
  });
});
