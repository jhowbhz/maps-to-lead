import { config } from '../config/env';

// Seletores centralizados. Baseados em atributos que o Google mantém estáveis
// por acessibilidade (aria/role/href/data-item-id), não em classes ofuscadas.
// LISTING/SCROLL são sobrescrevíveis via .env.
export const selectors = {
  listing: config.LISTING,
  scroll: config.SCROLL,
  // O campo de busca não usa mais só #searchboxinput; hoje é input[name="q"].
  searchBox: 'input#searchboxinput, input[name="q"]',
  detail: {
    title: 'h1',
    address: 'button[data-item-id="address"]',
    phone: '[data-item-id^="phone:tel:"]',
    telLink: 'a[href^="tel:"]',
    website: 'a[data-item-id="authority"]',
  },
} as const;
