import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { badRequest, notFound } from './errors.js';

/** Enveloppe les handlers async pour transmettre les erreurs au gestionnaire central. */
export const ah =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/** Valide une saisie avec un schéma zod ; message d'erreur lisible en français. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const first = r.error.issues[0];
  if (first?.code === 'unrecognized_keys') {
    throw badRequest(`Champ non autorisé : ${(first as { keys: string[] }).keys.join(', ')}.`, 'invalid_field');
  }
  const where = first?.path.length ? ` (${first.path.join('.')})` : '';
  throw badRequest(`Données invalides${where} : ${first?.message ?? 'vérifiez la saisie'}.`, 'validation');
}

const UUID = z.string().uuid();

/** Paramètre d'URL de type uuid ; un identifiant mal formé est traité comme « introuvable ». */
export function idParam(req: Request, name = 'id'): string {
  const r = UUID.safeParse(req.params[name]);
  if (!r.success) throw notFound();
  return r.data;
}

/** Normalise pour comparer sans accents ni casse. */
export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
