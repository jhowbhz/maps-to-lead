import { chromium, type Browser, type BrowserContext } from 'playwright';
import { config } from '../config/env';
import { logger } from '../config/logger';

// Recursos bloqueados quando BLOCK_RESOURCES=true. NÃO bloqueamos 'stylesheet'
// de propósito: o feed do Maps usa lazy-load guiado por layout, e derrubar o CSS
// pode atrapalhar a rolagem. Imagens/fontes/mídia são seguras e economizam banda.
const BLOCKED_RESOURCES = new Set(['image', 'media', 'font']);

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// BrowserManager: um único browser Playwright compartilhado no processo,
// lançado sob demanda e reusado. Cada job pega um BrowserContext isolado
// (cookies/estado próprios), fechado ao fim do job. Antes, o código lançava um
// Chromium inteiro POR requisição — caro; um contexto é muito mais barato.
// ---------------------------------------------------------------------------
export class BrowserManager {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;

    this.launching = chromium
      .launch({
        headless: config.HEADLESS,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--lang=pt-BR',
          '--mute-audio',
          '--no-first-run',
        ],
      })
      .then((browser) => {
        this.browser = browser;
        this.launching = null;
        browser.on('disconnected', () => {
          this.browser = null;
        });
        logger.info('Chromium iniciado (compartilhado)');
        return browser;
      });

    return this.launching;
  }

  /** Novo contexto isolado por job, com locale pt-BR e bloqueio de recursos. */
  async newContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      locale: 'pt-BR',
      viewport: { width: 1280, height: 900 },
      userAgent: DESKTOP_UA,
    });
    context.setDefaultNavigationTimeout(config.NAV_TIMEOUT_MS);

    // Em dev, o tsx/esbuild (keepNames) instrumenta funções nomeadas com o helper
    // `__name`, que NÃO existe no contexto da página — quebra page.evaluate com
    // "__name is not defined". Definimos um no-op em toda página. Passamos uma
    // STRING (o esbuild não a transforma) e no build de produção (tsc) é inócuo.
    await context.addInitScript(
      'globalThis.__name = globalThis.__name || function (t) { return t; };',
    );

    if (config.BLOCK_RESOURCES) {
      await context.route('**/*', (route) => {
        if (BLOCKED_RESOURCES.has(route.request().resourceType())) {
          return route.abort();
        }
        return route.continue();
      });
    }

    return context;
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (browser) {
      await browser.close().catch(() => {});
      logger.info('Chromium encerrado');
    }
  }
}
