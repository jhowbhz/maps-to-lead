// ---------------------------------------------------------------------------
// Classificação de links e extração de email/redes. Puro (sem I/O) — testável.
// ---------------------------------------------------------------------------

const IG_HOST = /(^|\.)(instagram\.com|instagr\.am)$/i;
const FB_HOST = /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export type LinkKind = 'instagram' | 'facebook' | 'site' | 'none';

/** Classifica uma URL: instagram, facebook, site (website comum) ou none. */
export function classifyLink(url: string | null | undefined): LinkKind {
  if (!url) return 'none';
  const host = hostOf(url);
  if (!host) return 'none';
  if (IG_HOST.test(host)) return 'instagram';
  if (FB_HOST.test(host)) return 'facebook';
  return 'site';
}

export interface RoutedLinks {
  instagram: string;
  facebook: string;
  site: string;
}

/**
 * Roteia o link do Maps para o campo certo: alguns negócios colocam o Instagram
 * ou o Facebook no lugar do "site" — aqui isso é identificado automaticamente.
 */
export function routeSiteLink(url: string | null | undefined): RoutedLinks {
  const out: RoutedLinks = { instagram: '', facebook: '', site: '' };
  const clean = (url || '').trim();
  switch (classifyLink(clean)) {
    case 'instagram': out.instagram = clean; break;
    case 'facebook': out.facebook = clean; break;
    case 'site': out.site = clean; break;
  }
  return out;
}

// Descarta "e-mails" que são na verdade nomes de arquivo/placeholders.
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_BLOCK = /(example\.com|domain\.com|email\.com|your(site|domain|email)|sentry|wixpress|\.(png|jpe?g|gif|svg|webp))/i;

/** Primeiro e-mail plausível encontrado no texto (ou ''). */
export function findEmail(text: string | null | undefined): string {
  const matches = String(text || '').match(EMAIL_RE) || [];
  for (const m of matches) {
    if (/@\dx\b/i.test(m)) continue; // @2x, @3x (retina)
    if (EMAIL_BLOCK.test(m)) continue;
    return m.toLowerCase();
  }
  return '';
}

const IG_URL = /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.][A-Za-z0-9_.\-/]*/i;
const FB_URL = /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_.][A-Za-z0-9_.\-/]*/i;
// Links de share/SDK/pixel que NÃO são o perfil do negócio.
const SOCIAL_JUNK = /\/(sharer|share\.php|plugins|dialog|tr\b|v\d+\.\d+)/i;

/** Extrai o primeiro link de Instagram/Facebook do HTML (perfil, não share). */
export function findSocialInHtml(html: string | null | undefined): { instagram: string; facebook: string } {
  const src = String(html || '');
  const pick = (re: RegExp): string => {
    const m = src.match(re);
    const url = m?.[0] ?? '';
    return url && !SOCIAL_JUNK.test(url) ? url : '';
  };
  return { instagram: pick(IG_URL), facebook: pick(FB_URL) };
}
