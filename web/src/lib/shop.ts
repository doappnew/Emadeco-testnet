import { api } from './api';
import { piPay } from './pi';

export interface ShopCategory {
  id: string;
  slug: string;
  name: string;
  count: number;
}

export interface Product {
  id: string;
  title: string;
  description: string | null;
  price_pi: number;
  image_url: string | null;
  image_path: string | null;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  is_active: boolean;
  sort_order: number;
}

export type OrderStatus = 'awaiting_payment' | 'paid' | 'preparing' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  status: OrderStatus;
  status_label: string;
  product_id: string | null;
  product_title: string;
  product_image_url: string | null;
  quantity: number;
  unit_price_pi: number;
  total_pi: number;
  recipient_name: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  landmark: string | null;
  notes: string | null;
  admin_note: string | null;
  paid_at: string | null;
  created_at: string;
  client_name?: string;
  pi_txid?: string | null;
}

export interface Delivery {
  recipient_name: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  landmark?: string;
  notes?: string;
}

/** « 0,85 π » — prix de test sur le réseau d'essai. */
export const formatPi = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} π`;

export const ORDER_TONE: Record<OrderStatus, 'info' | 'warn' | 'ok' | 'bad' | 'muted'> = {
  awaiting_payment: 'warn',
  paid: 'info',
  preparing: 'info',
  delivered: 'ok',
  cancelled: 'muted',
};

/** Regroupe les produits par catégorie, dans l'ordre des catégories. */
export function groupByCategory(categories: ShopCategory[], products: Product[]) {
  return categories
    .map((c) => ({ category: c, products: products.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.products.length > 0);
}

/**
 * Règle une commande avec Pi. Le montant et la commande sont vérifiés par le serveur
 * à l'approbation puis à la finalisation ; le navigateur ne décide de rien.
 */
export function payOrder(order: Order, sandbox: boolean) {
  return piPay({
    sandbox,
    amount: order.total_pi,
    memo: 'Commande EMADECO',
    metadata: { order_id: order.id },
    onApprove: (paymentId) => api.post('/shop/payments/approve', { paymentId }).then(() => undefined),
    onComplete: (paymentId, txid) => api.post('/shop/payments/complete', { paymentId, txid }).then(() => undefined),
    onIncomplete: (paymentId) => api.post('/shop/payments/incomplete', { paymentId }).then(() => undefined),
  });
}
