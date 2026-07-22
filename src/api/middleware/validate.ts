import type { RequestHandler } from 'express';
import { z } from 'zod';

// qt: quantos lugares (únicos) buscar. Inválido/<1 cai no padrão 20; teto 1000.
const qt = z.preprocess((v) => {
  const n = parseInt(String(v), 10);
  if (Number.isNaN(n) || n < 1) return 20;
  return Math.min(n, 1000);
}, z.number().int());

// Aceita true/false, "true"/"false" e 1/"1" como verdadeiro.
const onlyWithPhone = z.preprocess(
  (v) => v === true || v === 'true' || v === 1 || v === '1',
  z.boolean(),
);

export const findSchema = z.object({
  query: z.string().trim().min(1),
  webhook: z.string().trim().url(),
  qt: qt.default(20),
  onlyWithPhone: onlyWithPhone.default(false),
  // Mantidos por compatibilidade — aceitos, porém não usados.
  time: z.unknown().optional(),
  hook: z.unknown().optional(),
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
