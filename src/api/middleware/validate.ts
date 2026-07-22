import type { RequestHandler } from 'express';
import { z } from 'zod';

// Aceita true/false, "true"/"false" e 1/"1" como verdadeiro.
const boolParam = () =>
  z.preprocess((v) => v === true || v === 'true' || v === 1 || v === '1', z.boolean());

// query: o ramo + a localização, que viram a busca do Google Maps.
const querySchema = z.object({
  type: z.string().trim().min(1), // ex.: software, restaurante, mecânica
  city: z.string().trim().optional().default(''),
  state: z.string().trim().optional().default(''),
});

// webhook: destino + política de entrega por requisição.
const webhookSchema = z.object({
  url: z.string().trim().url(),
  retry: boolParam().default(true), // false => sem retentativas
  timeout: z.coerce.number().int().min(1000).max(120000).optional(), // ms
});

const optionsSchema = z
  .object({
    onlyWithPhone: boolParam().default(false), // só empresas com telefone
    onlyRepeat: boolParam().default(true), // false => sem telefones repetidos (dedupe)
    onlyInfosExtras: boolParam().default(false), // visita o site do lead p/ email/redes
  })
  .default({ onlyWithPhone: false, onlyRepeat: true, onlyInfosExtras: false });

export const findSchema = z.object({
  query: querySchema,
  webhook: webhookSchema,
  options: optionsSchema,
});

export type FindInput = z.infer<typeof findSchema>;

/** Valida o body de POST /api/find; em erro responde 400. */
export const validateFind: RequestHandler = (req, res, next) => {
  const parsed = findSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: true, message: 'Erro, verifique se você enviou todos os dados corretamente.' });
    return;
  }
  res.locals.find = parsed.data;
  next();
};
