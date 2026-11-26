import { z } from 'zod';
import { clean } from './validation.js';

const pre = (v: unknown) => (typeof v === 'string' ? clean(v) : v);
const text = (min: number, max: number) => z.preprocess(pre, z.string().min(min).max(max));
const optText = (max: number) => z.preprocess(pre, z.string().max(max).optional().nullable());
const uuid = z.string().uuid();

const imagePath = z
  .string()
  .max(300)
  .refine((u) => u.startsWith('/img/') || u.startsWith('products/'), 'Chemin d’image invalide.');

/** Prix de test en Pi : positif, 4 décimales au plus. */
const pricePi = z
  .number()
  .positive('Le prix doit être supérieur à 0.')
  .max(100000)
  .refine((n) => Math.abs(n * 10000 - Math.round(n * 10000)) < 1e-6, '4 décimales au maximum.');

export const deliverySchema = z
  .object({
    recipient_name: text(2, 80),
    phone: z.preprocess(pre, z.string().regex(/^[+0-9 ()-]{6,30}$/, 'Numéro de téléphone invalide.')),
    country: text(2, 60),
    city: text(2, 80),
    address: text(5, 200),
    landmark: optText(150),
    notes: optText(500),
  })
  .strict();

export const orderCreateSchema = z
  .object({
    product_id: uuid,
    quantity: z.number().int().min(1).max(50),
    delivery: deliverySchema,
  })
  .strict();

export const productCreateSchema = z
  .object({
    title: text(2, 120),
    description: optText(1500),
    category_id: uuid.nullable().optional(),
    price_pi: pricePi,
    image_path: imagePath.nullable().optional(),
    is_active: z.boolean().default(true),
    sort_order: z.number().int().min(0).max(100000).default(0),
  })
  .strict();

export const productUpdateSchema = z
  .object({
    title: text(2, 120).optional(),
    description: optText(1500),
    category_id: uuid.nullable().optional(),
    price_pi: pricePi.optional(),
    image_path: imagePath.nullable().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

export const orderAdminSchema = z
  .object({
    status: z.enum(['preparing', 'delivered', 'cancelled']),
    admin_note: optText(500),
  })
  .strict();

export const paymentIdSchema = z.object({ paymentId: z.string().min(1).max(128) }).strict();
export const paymentCompleteSchema = z
  .object({ paymentId: z.string().min(1).max(128), txid: z.string().min(1).max(256) })
  .strict();
