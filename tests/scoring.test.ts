import { describe, expect, it } from 'vitest';
import { scoreLead } from '../src/domain/scoring';
import type { Address, LeadPayload, Place } from '../src/domain/types';

const place = (over: Partial<Place> = {}): Place => ({
  name: 'X', rating: '0', reviews: '0', price: '', link: '', image: '', ...over,
});

const payload = (over: { phone?: string; whatsapp?: string; site?: string; address?: Partial<Address> } = {}): LeadPayload => ({
  lead: {
    name: 'X',
    pic: '',
    rating: { note: '0', quantity: 0 },
    address: { street: '', number: '', neighborhood: '', city: '', uf: '', cep: '', full: '', ...over.address },
    contacts: { phone: over.phone ?? '', whatsapp: over.whatsapp ?? '', ddd: '', email: '' },
    social: { instagram: '', facebook: '', site: over.site ?? '' },
    extra: { site_visitado: false, campos_encontrados: [], email: '', instagram: '', facebook: '' },
  },
});

describe('scoreLead', () => {
  it('lead vazio pontua 0 e cai no tier D', () => {
    const r = scoreLead(payload(), place());
    expect(r.score).toBe(0);
    expect(r.tier).toBe('D');
  });

  it('lead completo pontua alto (tier A)', () => {
    const r = scoreLead(
      payload({
        phone: '+553133334444',
        whatsapp: '+5531999984339',
        site: 'https://x.com',
        address: { street: 'R', number: '1', neighborhood: 'C', city: 'BH', uf: 'MG', cep: '', full: 'x' },
      }),
      place({ rating: '5', reviews: '500' }),
    );
    expect(r.breakdown.phone).toBe(30);
    expect(r.breakdown.whatsapp).toBe(15);
    expect(r.breakdown.website).toBe(20);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.tier).toBe('A');
  });

  it('telefone sem whatsapp e sem site rende tier C/D', () => {
    const r = scoreLead(payload({ phone: '+553133334444' }), place({ rating: '4', reviews: '10' }));
    expect(r.breakdown.phone).toBe(30);
    expect(r.breakdown.whatsapp).toBe(0);
    expect(r.tier === 'C' || r.tier === 'D').toBe(true);
  });

  it('aceita dados nulos sem quebrar', () => {
    const r = scoreLead(null, null);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('D');
  });
});
