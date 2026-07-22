import { logger } from '../config/logger';
import type { Lead } from '../domain/types';
import { contactUrls, findEmail, findSocialInHtml } from '../parsing/social';

const MAX_BYTES = 512 * 1024; // 512KB de HTML já é mais que suficiente
const MAX_CONTACT_PAGES = 2; // quantas páginas de contato tentar atrás de email

// Lê o corpo da resposta com teto de bytes (não baixa sites gigantes inteiros).
async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < max) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; maps-to-lead/2)' },
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(ct)) return '';
    return await readCapped(res, MAX_BYTES);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enriquecimento best-effort: visita o `site` do lead e tenta achar email,
 * instagram e facebook. Preenche os campos vazios do lead E registra o que foi
 * achado em `lead.extra`. Nunca lança.
 */
export async function enrichLeadFromSite(lead: Lead, timeoutMs: number): Promise<void> {
  const site = lead.social.site;
  if (!site) return; // sem site: nada a visitar (extra.site_visitado fica false)

  lead.extra.site_visitado = true;
  try {
    const html = await fetchHtml(site, timeoutMs);
    if (!html) return;

    let email = findEmail(html);
    const { instagram, facebook } = findSocialInHtml(html);

    // Se a home não tem email, segue os links de contato (best-effort, limitado).
    if (!email) {
      for (const url of contactUrls(html, site).slice(0, MAX_CONTACT_PAGES)) {
        const chtml = await fetchHtml(url, timeoutMs);
        if (!chtml) continue;
        email = findEmail(chtml);
        if (email) break;
      }
    }

    const found: string[] = [];

    if (email) {
      lead.extra.email = email;
      if (!lead.contacts.email) lead.contacts.email = email;
      found.push('email');
    }
    if (instagram) {
      lead.extra.instagram = instagram;
      if (!lead.social.instagram) lead.social.instagram = instagram;
      found.push('instagram');
    }
    if (facebook) {
      lead.extra.facebook = facebook;
      if (!lead.social.facebook) lead.social.facebook = facebook;
      found.push('facebook');
    }
    lead.extra.campos_encontrados = found;
  } catch (err) {
    logger.debug({ err, site }, 'Falha ao enriquecer pelo site');
  }
}
