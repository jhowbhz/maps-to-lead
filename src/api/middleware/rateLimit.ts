import { rateLimit } from 'express-rate-limit';
import { config } from '../../config/env';

// ---------------------------------------------------------------------------
// Limitador de taxa por IP. Contém floods/DoS nas rotas HTTP que tocam disco
// (SPA/assets do painel, Swagger), banco ou geram planilhas (.xlsx). O uso
// normal do painel (1 conexão SSE + polling esporádico) cabe folgado no teto;
// ajuste RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX no .env se precisar.
//
// Atrás de um proxy reverso (nginx/traefik) e SEM `trust proxy`, todos os
// clientes chegam com o IP do proxy — o limite passa a valer para o tráfego
// somado. É o padrão seguro (o IP não é falsificável); se o painel for exposto
// por um proxy confiável e você quiser limite por cliente, configure o
// `trust proxy` do Express de acordo com a sua topologia.
// ---------------------------------------------------------------------------
export const apiRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7', // expõe RateLimit-* padrão
  legacyHeaders: false, // sem os X-RateLimit-* antigos
  message: { error: true, message: 'Muitas requisições. Tente novamente em instantes.' },
});
