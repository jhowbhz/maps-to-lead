import type { Address } from '../domain/types';

// UFs válidas do Brasil (evita confundir uma sigla qualquer com o estado).
const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const emptyAddress = (): Address => ({
  street: '', number: '', neighborhood: '', city: '', uf: '', cep: '', full: '',
});

const trimEnds = (x: string): string => x.replace(/^[\s,\-–]+|[\s,\-–]+$/g, '').trim();

// Uma "porta": só número (com sufixo de letra opcional), s/n ou "km 12".
const isNumberPart = (p: string): boolean =>
  /^\d+[A-Za-z]?$/.test(p) || /^s\/?n$/i.test(p) || /^km\s*\d/i.test(p);

/**
 * Quebra o endereço do Google Maps (pt-BR) nas partes.
 * Formato típico: "Logradouro, Número - Bairro, Cidade - UF, CEP".
 */
export function parseAddressBR(raw: string | null | undefined): Address {
  const out = emptyAddress();
  if (!raw) return out;

  let s = String(raw).replace(/\s+/g, ' ').trim();
  out.full = s;

  // CEP: 00000-000 (ou 8 dígitos seguidos).
  const cep = s.match(/(\d{5})-?(\d{3})\b/);
  if (cep) {
    out.cep = `${cep[1]}-${cep[2]}`;
    s = s.replace(cep[0], '');
  }
  s = trimEnds(s);

  // UF: 2 letras válidas no fim, depois de "-" ou ",".
  const uf = s.match(/[-,]\s*([A-Za-z]{2})\s*$/);
  const ufCode = uf?.[1];
  if (uf && uf.index !== undefined && ufCode && UFS.has(ufCode.toUpperCase())) {
    out.uf = ufCode.toUpperCase();
    s = trimEnds(s.slice(0, uf.index));
  }

  // Cidade: último trecho após vírgula.
  const cityComma = s.lastIndexOf(',');
  if (cityComma !== -1) {
    out.city = trimEnds(s.slice(cityComma + 1));
    s = trimEnds(s.slice(0, cityComma));
  }

  // Bairro (forma dominante): trecho após o último " - ".
  const dash = s.lastIndexOf(' - ');
  if (dash !== -1) {
    out.neighborhood = trimEnds(s.slice(dash + 3));
    s = trimEnds(s.slice(0, dash));
  }

  // Sobra "Logradouro, Número[, Bairro]". Acha a parte que é só número (porta):
  // ela separa o logradouro (antes) do bairro (depois, se houver).
  const parts = s.split(',').map(trimEnds).filter(Boolean);
  let numIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p && isNumberPart(p)) {
      numIdx = i;
      break;
    }
  }
  if (numIdx !== -1) {
    out.number = parts[numIdx] ?? '';
    out.street = parts.slice(0, numIdx).join(', ');
    if (!out.neighborhood && numIdx < parts.length - 1) {
      out.neighborhood = parts.slice(numIdx + 1).join(', ');
    }
  } else {
    out.street = parts.join(', ');
  }

  return out;
}
