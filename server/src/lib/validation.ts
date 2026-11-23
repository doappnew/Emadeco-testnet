import { z } from 'zod';
import { REQUEST_STATUSES } from './requestStatus.js';

/** Retire les caractères de contrôle (sauf retour à la ligne) et les espaces de bord. */
export const clean = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

const pre = (v: unknown) => (typeof v === 'string' ? clean(v) : v);

const text = (min: number, max: number) => z.preprocess(pre, z.string().min(min).max(max));
const optText = (max: number) => z.preprocess(pre, z.string().max(max).optional().nullable());
const uuid = z.string().uuid();
const stringList = (maxItems: number, maxLen: number) =>
  z
    .array(z.preprocess(pre, z.string().min(1).max(maxLen)))
    .max(maxItems)
    .default([]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format AAAA-MM-JJ).')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Date invalide.')
  .refine((s) => s >= new Date().toISOString().slice(0, 10), 'La date doit être aujourd’hui ou dans le futur.');

const imageUrl = z
  .string()
  .max(500)
  .refine((u) => u.startsWith('/img/') || /^https:\/\//.test(u), 'URL d’image invalide.');

// NB : tous les schémas de saisie sont stricts (.strict()). Toute clé inconnue est refusée,
// ce qui empêche par construction l'envoi de champs non prévus.

export const piLoginSchema = z.object({ accessToken: z.string().min(8).max(4096) }).strict();

export const demoLoginSchema = z.object({ role: z.enum(['client', 'provider', 'admin']) }).strict();

export const profileUpdateSchema = z
  .object({ display_name: optText(80), city: optText(80) })
  .strict();

export const providerProfileSchema = z
  .object({
    business_name: text(2, 100),
    bio: optText(2000),
    specialties: stringList(12, 40),
    service_zones: stringList(20, 60),
    city: optText(80),
  })
  .strict();

export const serviceSchema = z
  .object({
    category_id: uuid,
    title: text(2, 120),
    description: optText(1500),
    is_active: z.boolean().default(true),
  })
  .strict();

export const portfolioMetaSchema = z
  .object({
    title: text(2, 120),
    description: optText(1000),
    category_id: uuid.optional().nullable(),
  })
  .strict();

export const createRequestSchema = z
  .object({
    provider_id: uuid,
    category_id: uuid.optional().nullable(),
    service_id: uuid.optional().nullable(),
    event_type: text(2, 60),
    event_date: isoDate,
    event_location: text(2, 200),
    guests_approx: z.coerce.number().int().min(1).max(100000).optional().nullable(),
    theme: optText(120),
    colors: optText(120),
    requested_services: optText(600),
    details: optText(2000),
    inspiration_paths: z.array(z.string().max(200)).max(5).default([]),
  })
  .strict();

export const statusChangeSchema = z
  .object({ status: z.enum(REQUEST_STATUSES), note: optText(500) })
  .strict();

export const messageSchema = z.object({ body: text(1, 2000) }).strict();

export const reportSchema = z
  .object({
    target_type: z.enum(['provider', 'portfolio_item', 'user', 'request']),
    target_id: uuid,
    reason: text(3, 120),
    details: optText(1000),
  })
  .strict();

export const favoriteSchema = z
  .object({ provider_id: uuid.optional(), portfolio_item_id: uuid.optional() })
  .strict()
  .refine((v) => Boolean(v.provider_id) !== Boolean(v.portfolio_item_id), {
    message: 'Indiquez soit un prestataire, soit une réalisation.',
  });

export const categorySchema = z
  .object({
    name: text(2, 80),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug invalide (minuscules, chiffres, tirets).').max(60),
    description: optText(400),
    image_url: imageUrl.optional().nullable(),
    sort_order: z.coerce.number().int().min(0).max(10000).default(0),
    is_active: z.boolean().default(true),
  })
  .strict();

export const providerModerationSchema = z
  .object({ status: z.enum(['pending', 'approved', 'rejected', 'suspended']), note: optText(300) })
  .strict();

export const portfolioModerationSchema = z
  .object({ status: z.enum(['approved', 'rejected']), note: optText(300) })
  .strict();

export const userStatusSchema = z
  .object({ status: z.enum(['active', 'suspended']), note: optText(300) })
  .strict();

export const reportResolveSchema = z
  .object({ status: z.enum(['reviewed', 'dismissed', 'actioned']), note: optText(300) })
  .strict();

export const providerQuerySchema = z.object({
  q: z.preprocess(pre, z.string().max(80).optional()),
  category: z.preprocess(pre, z.string().max(80).optional()),
  zone: z.preprocess(pre, z.string().max(80).optional()),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

/** Convertit '' / undefined en null pour l'écriture en base. */
export const nn = <T>(v: T | undefined | null | ''): T | null => (v === undefined || v === null || v === '' ? null : v);
