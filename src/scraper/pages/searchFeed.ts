import type { Page } from 'playwright';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import type { Place } from '../../domain/types';
import { selectors } from '../selectors';

// ---------------------------------------------------------------------------
// FASE 1: abrir a busca, rolar o feed até o fim e coletar TODOS os lugares.
// Tudo aqui é interação de página (Playwright) — sem regra de negócio.
// ---------------------------------------------------------------------------

/** Abre o Maps, digita a busca e espera o feed de resultados aparecer. */
export async function performSearch(page: Page, query: string): Promise<void> {
  await page.goto('https://www.google.com/maps?hl=pt-BR', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(selectors.searchBox, { timeout: config.NAV_TIMEOUT_MS });
  await page.click(selectors.searchBox);
  await page.fill(selectors.searchBox, query);
  await page.keyboard.press('Enter');
  await page.waitForSelector(selectors.listing, { timeout: config.NAV_TIMEOUT_MS });
}

/**
 * Rola o feed até ACABAR a lista (traz tudo que existir na região). O Google
 * carrega os cards de forma preguiçosa conforme você rola; então "varremos
 * página por página" até o fim ou até parar de crescer.
 */
export async function scrollFeed(page: Page, waitMs = 1200, maxIdleRounds = 5): Promise<void> {
  let previousCount = 0;
  let idleRounds = 0;

  while (true) {
    // Quantos lugares únicos já carregaram no feed (dedupe por href).
    const count = await page.evaluate((sel: string) => {
      const links = new Set<string>();
      document.querySelectorAll(sel).forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        if (href) links.add(href);
      });
      return links.size;
    }, selectors.listing);

    logger.debug(`Scroll: ${count} lugares carregados`);

    // O Google mostra "Você chegou ao final da lista." quando acaba.
    const reachedEnd = await page.evaluate((sel: string) => {
      const feed = document.querySelector(sel) as HTMLElement | null;
      return feed ? /final da lista|reached the end/i.test(feed.innerText || '') : false;
    }, selectors.scroll);
    if (reachedEnd) break;

    // Sem crescimento por várias rodadas seguidas = provável fim.
    if (count === previousCount) {
      idleRounds += 1;
      if (idleRounds >= maxIdleRounds) break;
    } else {
      idleRounds = 0;
      previousCount = count;
    }

    // Rola até o fim do container para disparar a próxima "página" de resultados.
    await page.evaluate((sel: string) => {
      const feed = document.querySelector(sel);
      if (feed) feed.scrollTo(0, feed.scrollHeight);
    }, selectors.scroll);

    // eslint-disable-next-line no-await-in-loop -- espera o lazy-load renderizar
    await page.waitForTimeout(waitMs);
  }
}

/** Coleta TODOS os lugares do feed (nome, nota, avaliações, link, imagem). */
export async function collectPlaces(page: Page): Promise<Place[]> {
  try {
    const places = await page.evaluate((listingSelector: string) => {
      const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();

      const anchors = Array.from(document.querySelectorAll(listingSelector));
      const seen = new Set<string>();
      const result: Array<{
        name: string; rating: string; reviews: string; price: string; link: string; image: string;
      }> = [];

      for (const a of anchors) {
        const anchor = a as HTMLAnchorElement;
        const link = anchor.href || '';
        if (!link || seen.has(link)) continue;
        seen.add(link);

        // O card envolve o link (overlay) + o conteúdo, como irmãos.
        const card = anchor.parentElement || anchor;

        // Nome: aria-label do próprio link (estável). Fallback: trecho /place/<nome>/.
        let name = clean(anchor.getAttribute('aria-label'));
        if (!name) {
          const m = link.match(/\/place\/([^/]+)/);
          if (m && m[1]) name = clean(decodeURIComponent(m[1].replace(/\+/g, ' ')));
        }

        // Nota + avaliações: widget [role="img"] cujo aria-label começa com a nota.
        let rating = '';
        let reviews = '';
        for (const el of Array.from(card.querySelectorAll('[role="img"][aria-label]'))) {
          const label = el.getAttribute('aria-label') || '';
          const m = label.match(/^\s*([0-5](?:[.,]\d)?)\b/);
          if (m && m[1]) {
            rating = m[1].replace(',', '.');
            const nums = label.match(/[\d.,]+/g) || [];
            reviews = (nums[1] || '').replace(/[.,]/g, '');
            break;
          }
        }

        const image = card.querySelector('img')?.getAttribute('src') || '';
        result.push({ name, rating, reviews, price: '', link, image });
      }

      return result;
    }, selectors.listing);

    return places;
  } catch (err) {
    logger.error({ err }, 'Erro ao coletar lugares do feed');
    return [];
  }
}
