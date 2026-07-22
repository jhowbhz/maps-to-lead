import type { BrowserContext } from 'playwright';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import type { LeadPayload, Place, PlaceDetail } from '../../domain/types';
import { isMobileBR, normalizePhoneBR } from '../../parsing/phone';
import { parseAddressBR } from '../../parsing/address';
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

        return { name, address, phone, website } satisfies PlaceDetail;
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

// Monta o payload final: dados do lugar aninhados em `lead` (endereço já
// estruturado) + `infos` no topo como resumo em texto puro.
function buildPayload(place: Place, detail: PlaceDetail, onlyWithPhone: boolean): LeadPayload | null {
  const number = normalizePhoneBR(detail.phone);
  const whatsapp = isMobileBR(number) ? number : '';
  const address = parseAddressBR(detail.address);

  // Opcional: quando onlyWithPhone=true, ignora lugares sem telefone.
  if (onlyWithPhone && !number) {
    logger.debug({ name: detail.name || place.name }, 'Pulado (sem telefone)');
    return null;
  }

  return {
    lead: {
      name: detail.name || place.name || '',
      rating: place.rating || '0',
      pic: place.image || '',
      address,
      phone: number,
      whatsapp,
      website: detail.website || '',
    },
    infos: [address.full, number, detail.website].filter(Boolean),
  };
}
