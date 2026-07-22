import { describe, expect, it } from 'vitest';
import { dddFromPhone, isMobileBR, normalizePhoneBR } from '../src/parsing/phone';

describe('normalizePhoneBR', () => {
  it('adiciona DDI 55 quando veio só com DDD (celular, 11 dígitos)', () => {
    expect(normalizePhoneBR('(31) 99998-4339')).toBe('+5531999984339');
  });

  it('adiciona DDI 55 quando veio só com DDD (fixo, 10 dígitos)', () => {
    expect(normalizePhoneBR('31 3333-4444')).toBe('+553133334444');
  });

  it('remove o 0 de tronco', () => {
    expect(normalizePhoneBR('031999984339')).toBe('+5531999984339');
  });

  it('mantém o número quando já vem com DDI', () => {
    expect(normalizePhoneBR('+55 31 99998-4339')).toBe('+5531999984339');
    expect(normalizePhoneBR('5531999984339')).toBe('+5531999984339');
  });

  it('retorna vazio quando não há dígitos', () => {
    expect(normalizePhoneBR('')).toBe('');
    expect(normalizePhoneBR(null)).toBe('');
    expect(normalizePhoneBR(undefined)).toBe('');
    expect(normalizePhoneBR('sem número')).toBe('');
  });
});

describe('isMobileBR', () => {
  it('reconhece celular (13 dígitos, 9º após o DDD)', () => {
    expect(isMobileBR('+5531999984339')).toBe(true);
  });

  it('rejeita fixo (12 dígitos)', () => {
    expect(isMobileBR('+553133334444')).toBe(false);
  });

  it('rejeita vazio', () => {
    expect(isMobileBR('')).toBe(false);
  });
});

describe('dddFromPhone', () => {
  it('extrai o DDD de um celular (+5531...)', () => {
    expect(dddFromPhone('+5531971711407')).toBe('31');
  });

  it('extrai o DDD de um fixo (+553133...)', () => {
    expect(dddFromPhone('+553133334444')).toBe('31');
  });

  it('descarta 0800/0300 e afins (DDD não geográfico)', () => {
    expect(dddFromPhone('+558007025700')).toBe(''); // 0800 -> "80" não é DDD válido
    expect(dddFromPhone('+553003001234')).toBe(''); // 0300 -> "30" não é DDD válido
  });

  it('retorna vazio sem DDI/telefone', () => {
    expect(dddFromPhone('')).toBe('');
    expect(dddFromPhone(null)).toBe('');
  });
});
