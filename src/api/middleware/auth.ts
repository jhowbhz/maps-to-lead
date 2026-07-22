import type { RequestHandler } from 'express';
import { config } from '../../config/env';

// ---------------------------------------------------------------------------
// Login do painel = TOKEN apenas (MANAGER_TOKEN no .env). Aceita via header
// Authorization: Bearer <token>, header X-Manager-Token, ou ?token= (o SSE usa
// querystring porque o EventSource não manda headers).
// ---------------------------------------------------------------------------
export const requireToken: RequestHandler = (req, res, next) => {
  const configured = config.MANAGER_TOKEN;
  if (!configured) {
    res.status(503).json({ error: true, message: 'MANAGER_TOKEN não configurado no .env do servidor.' });
    return;
  }

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const headerToken = typeof req.headers['x-manager-token'] === 'string' ? req.headers['x-manager-token'] : '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const provided = bearer || headerToken || queryToken;

  if (provided && provided === configured) {
    next();
    return;
  }
  res.status(401).json({ error: true, message: 'Token inválido.' });
};
