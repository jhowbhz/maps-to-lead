import type { LeadPayload, Place, ScoreBreakdown, ScoreResult, Tier } from './types';

// ---------------------------------------------------------------------------
// SCORE DO LEAD (0-100). Transparente e ajustável: quanto mais "acionável" e
// completo o lead, maior a nota. Os pesos somam 100 e vão no breakdown pra dar
// pra ver EXATAMENTE de onde veio a nota.
//
//   telefone (qualquer) ....... 30
//   whatsapp (celular) ........ 15
//   site ...................... 20
//   nota (rating 0-5) ......... 15
//   avaliações (log até ~500) . 10
//   endereço completo ......... 10
// ---------------------------------------------------------------------------

function tierFor(score: number): Tier {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

export function scoreLead(dados: LeadPayload | null, place: Place | null): ScoreResult {
  const b: ScoreBreakdown = { phone: 0, whatsapp: 0, website: 0, rating: 0, reviews: 0, address: 0 };

  const src = dados?.lead;
  const phone = src?.contacts.phone ?? '';
  const whatsapp = src?.contacts.whatsapp ?? '';
  const website = src?.social.site ?? '';
  const addr = src?.address;

  if (phone) b.phone = 30;
  if (whatsapp) b.whatsapp = 15;
  if (website) b.website = 20;

  const rating = parseFloat(String(place?.rating ?? '0').replace(',', '.')) || 0;
  b.rating = Math.round((Math.max(0, Math.min(5, rating)) / 5) * 15);

  const reviews = parseInt(String(place?.reviews ?? '0').replace(/\D/g, ''), 10) || 0;
  // Escala logarítmica: ~500 avaliações já satura os 10 pontos.
  b.reviews = reviews > 0 ? Math.round(Math.min(1, Math.log10(reviews + 1) / Math.log10(501)) * 10) : 0;

  // Endereço: pontos por completude (rua, número, bairro, cidade, uf).
  let addrParts = 0;
  if (addr) {
    (['street', 'number', 'neighborhood', 'city', 'uf'] as const).forEach((k) => {
      if (addr[k]) addrParts++;
    });
  }
  b.address = Math.round((addrParts / 5) * 10);

  const score = Math.max(
    0,
    Math.min(100, b.phone + b.whatsapp + b.website + b.rating + b.reviews + b.address),
  );

  return { score, tier: tierFor(score), breakdown: b };
}
