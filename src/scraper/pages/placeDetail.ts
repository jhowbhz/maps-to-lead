import type { BrowserContext } from 'playwright';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import type { LeadPayload, Place, PlaceDetail } from '../../domain/types';
import { dddFromPhone, isMobileBR, normalizePhoneBR } from '../../parsing/phone';
import { parseAddressBR } from '../../parsing/address';
import { routeSiteLink } from '../../parsing/social';
import { selectors } from '../selectors';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ExtractOptions {
  onlyWithPhone: boolean;
  retries: number;
}

// ---------------------------------------------------------------------------
// FASE 2 (por lugar): abre a página de detalhe, lê telefone/endereço/site por
// atributos ESTÁVEIS (data-item-id) e devolve o payload pronto — ou null quando
// deve ser pulado (onlyWithPhone e sem telefone). Retenta a navegação com
// backoff em falhas transitórias. NÃO envia webhook (quem envia é o dispatcher).
// ---------------------------------------------------------------------------
export async function extractPlaceDetail(
  context: BrowserContext,
  place: Place,
  opts: ExtractOptions,
): Promise<LeadPayload | null> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const page = await context.newPage();
    try {
      await page.goto(place.link, { waitUntil: 'domcontentloaded' });

      // A página de detalhe carrega assíncrono; espera um sinal ESTÁVEL de que
      // abriu (o título do lugar) antes de coletar.
      await page.waitForSelector(selectors.detail.title, { timeout: config.DETAIL_TIMEOUT_MS }).catch(() => {});

      const detail = await page.evaluate((sel: typeof selectors.detail) => {
        const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
        // "Endereço: Rua X, 123" -> "Rua X, 123"
        const stripLabel = (s: string) => clean(s).replace(/^[^:]*:\s*/, '');

        const name = clean(document.querySelector(sel.title)?.textContent);

        const addressBtn = document.querySelector(sel.address);
        const address = addressBtn ? stripLabel(addressBtn.getAttribute('aria-label') || '') : '';

        // O telefone vem literalmente no data-item-id: "phone:tel:+5511999999999".
        let phone = '';
        const phoneEl = document.querySelector(sel.phone);
        if (phoneEl) {
          phone = (phoneEl.getAttribute('data-item-id') || '').replace('phone:tel:', '').replace(/\D/g, '');
        }
        if (!phone) {
          const tel = document.querySelector(sel.telLink);
          if (tel) phone = (tel.getAttribute('href') || '').replace(/\D/g, '');
        }

        const website = (document.querySelector(sel.website) as HTMLAnchorElement | null)?.href || '';

        // Email via link mailto: na própria página do Maps (raro, mas de graça).
        const mailtoEl = document.querySelector('a[href^="mailto:"]');
        const email = mailtoEl
          ? ((mailtoEl.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0] || '').trim()
          : '';

        return { name, address, phone, website, email } satisfies PlaceDetail;
      }, selectors.detail);

      return buildPayload(place, detail, opts.onlyWithPhone);
    } catch (err) {
      lastErr = err;
      if (attempt < opts.retries) {
        const backoff = 500 * (attempt + 1);
        logger.debug({ err, link: place.link, attempt }, `Detalhe falhou, retry em ${backoff}ms`);
        await delay(backoff);
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  throw lastErr;
}

// Monta o payload final. O link do Maps é roteado automaticamente: se o "site"
// for na verdade um Instagram/Facebook, vai pro campo certo. O `extra` só é
// preenchido depois, pelo enriquecimento (visita ao site) — aqui fica vazio.
function buildPayload(place: Place, detail: PlaceDetail, onlyWithPhone: boolean): LeadPayload | null {
  const phone = normalizePhoneBR(detail.phone);
  const whatsapp = isMobileBR(phone) ? phone : '';
  const address = parseAddressBR(detail.address);
  const routed = routeSiteLink(detail.website); // detecta ig/fb no link do Maps

  // Opcional: quando onlyWithPhone=true, ignora lugares sem telefone.
  if (onlyWithPhone && !phone) {
    logger.debug({ name: detail.name || place.name }, 'Pulado (sem telefone)');
    return null;
  }

  return {
    lead: {
      name: detail.name || place.name || '',
      pic: place.image || '',
      rating: {
        note: place.rating || '0',
        quantity: parseInt(String(place.reviews || '0').replace(/\D/g, ''), 10) || 0,
      },
      address,
      contacts: {
        phone,
        whatsapp,
        ddd: dddFromPhone(phone),
        email: detail.email || '',
      },
      social: {
        instagram: routed.instagram,
        facebook: routed.facebook,
        site: routed.site,
      },
      extra: { site_visitado: false, campos_encontrados: [], email: '', instagram: '', facebook: '' },
    },
  };
}
