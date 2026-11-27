import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { seedCategories, seedDemo } from '../src/store/demoData.js';
import { MemoryStore } from '../src/store/memory.js';
import { fakePiFetch } from './helpers.js';

/** Fausse API Pi avec paiements : mémorise les appels approve / complete. */
function makePi() {
  const payments = new Map<string, any>();
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.endsWith('/me')) return fakePiFetch(url, init);
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== 'Key test-api-key') return new Response('{"error":"unauthorized"}', { status: 401 });
    const m = url.match(/\/payments\/([^/]+)(?:\/(approve|complete))?$/);
    if (!m) return new Response('{}', { status: 404 });
    const p = payments.get(m[1]!);
    if (!p) return new Response('{"error":"payment_not_found"}', { status: 404 });
    if (!m[2]) return new Response(JSON.stringify(p), { status: 200 });
    calls.push(`${m[2]}:${m[1]}`);
    if (m[2] === 'approve') p.status.developer_approved = true;
    else {
      p.status.developer_completed = true;
      p.transaction = { txid: JSON.parse(String(init?.body)).txid, verified: true };
    }
    return new Response(JSON.stringify(p), { status: 200 });
  };
  const add = (id: string, over: Record<string, unknown>) =>
    payments.set(id, { identifier: id, status: { developer_approved: false, developer_completed: false, cancelled: false, user_cancelled: false }, transaction: null, ...over });
  return { fetchImpl, payments, calls, add };
}

async function setup(withKey = true, extra: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123456',
    ADMIN_PI_USERNAMES: 'boss',
    ...(withKey ? { PI_API_KEY: 'test-api-key' } : {}),
    ...extra,
  } as NodeJS.ProcessEnv);
  const store = new MemoryStore();
  await seedCategories(store);
  await seedDemo(store);
  const pi = makePi();
  const app = createApp({ config, store, fetchImpl: pi.fetchImpl });
  const http = request(app);
  const login = async (name: string) => {
    const r = await http.post('/api/auth/pi').send({ accessToken: `tok-${name}-0123456789` });
    return { auth: { Authorization: `Bearer ${r.body.token}` }, id: r.body.profile.id as string };
  };
  return { http, store, pi, login };
}

const delivery = { recipient_name: 'Awa Koffi', phone: '+229 97 00 00 00', country: 'Bénin', city: 'Cotonou', address: 'Rue 123, quartier Fidjrossè', landmark: 'Près de la pharmacie' };

describe('boutique — accès et catalogue', () => {
  it('exige une connexion', async () => {
    const { http } = await setup();
    expect((await http.get('/api/shop/products')).status).toBe(401);
    expect((await http.post('/api/shop/orders').send({})).status).toBe(401);
  });

  it('liste uniquement les produits actifs, avec prix de test et catégorie', async () => {
    const { http, login } = await setup();
    const u = await login('alice');
    const r = await http.get('/api/shop/products').set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.products.length).toBe(3);
    expect(r.body.products.every((p: any) => p.is_active && p.price_pi > 0 && p.category_name)).toBe(true);
    expect(r.body.categories.every((c: any) => c.count > 0)).toBe(true);
  });
});

describe('boutique — commande', () => {
  it('crée une commande dont le montant est calculé par le serveur', async () => {
    const { http, login } = await setup();
    const u = await login('alice');
    const [p] = (await http.get('/api/shop/products').set(u.auth)).body.products;
    const r = await http.post('/api/shop/orders').set(u.auth).send({ product_id: p.id, quantity: 3, delivery });
    expect(r.status).toBe(201);
    expect(r.body.order.total_pi).toBeCloseTo(p.price_pi * 3, 4);
    expect(r.body.order.status).toBe('awaiting_payment');
    expect(r.body.order.city).toBe('Cotonou');
  });

  it('refuse un prix envoyé par le navigateur, une adresse absente et un produit inactif', async () => {
    const { http, login, store } = await setup();
    const u = await login('alice');
    const [p] = (await http.get('/api/shop/products').set(u.auth)).body.products;
    expect((await http.post('/api/shop/orders').set(u.auth).send({ product_id: p.id, quantity: 1, total_pi: 0.0001, delivery })).status).toBe(400);
    expect((await http.post('/api/shop/orders').set(u.auth).send({ product_id: p.id, quantity: 1, delivery: { ...delivery, address: '' } })).status).toBe(400);
    expect((await http.post('/api/shop/orders').set(u.auth).send({ product_id: p.id, quantity: 0, delivery })).status).toBe(400);
    const [inactive] = await store.select('products', { eq: { is_active: false } });
    expect((await http.post('/api/shop/orders').set(u.auth).send({ product_id: inactive!.id, quantity: 1, delivery })).status).toBe(404);
  });

  it('un client ne voit jamais la commande d’un autre', async () => {
    const { http, login } = await setup();
    const a = await login('alice');
    const b = await login('bob');
    const [p] = (await http.get('/api/shop/products').set(a.auth)).body.products;
    const o = (await http.post('/api/shop/orders').set(a.auth).send({ product_id: p.id, quantity: 1, delivery })).body.order;
    expect((await http.get(`/api/shop/orders/${o.id}`).set(b.auth)).status).toBe(404);
    expect((await http.get('/api/shop/orders').set(b.auth)).body.orders).toEqual([]);
    expect((await http.post(`/api/shop/orders/${o.id}/cancel`).set(b.auth)).status).toBe(404);
  });
});

describe('boutique — plafond PI_MAX_PAYMENT', () => {
  it('lit le plafond depuis la configuration (absent, invalide ou ≤ 0 = aucun plafond)', () => {
    const base = { NODE_ENV: 'test' } as Record<string, string>;
    expect(loadConfig({ ...base, PI_MAX_PAYMENT: '5' } as NodeJS.ProcessEnv).pi.maxPayment).toBe(5);
    expect(loadConfig({ ...base, PI_MAX_PAYMENT: '0' } as NodeJS.ProcessEnv).pi.maxPayment).toBeNull();
    expect(loadConfig({ ...base, PI_MAX_PAYMENT: 'abc' } as NodeJS.ProcessEnv).pi.maxPayment).toBeNull();
    expect(loadConfig(base as NodeJS.ProcessEnv).pi.maxPayment).toBeNull();
  });

  it('refuse une commande dont le total dépasse le plafond, accepte celle qui l’égale', async () => {
    const { http, login, store } = await setup(true, { PI_MAX_PAYMENT: '2' });
    const u = await login('alice');
    const [p] = await store.select('products', { eq: { is_active: true }, limit: 1 });
    await store.update('products', { eq: { id: p!.id } }, { price_pi: 1 });
    const over = await http.post('/api/shop/orders').set(u.auth).send({ product_id: p!.id, quantity: 3, delivery });
    expect(over.status).toBe(400);
    expect(over.body.error.message).toBe('Montant maximal autorisé pendant la phase de test : 2 Pi.');
    expect(await store.count('orders', {})).toBe(0);
    const ok = await http.post('/api/shop/orders').set(u.auth).send({ product_id: p!.id, quantity: 2, delivery });
    expect(ok.status).toBe(201);
  });

  it('sans plafond configuré, aucune limite n’est appliquée', async () => {
    const { http, login, store } = await setup();
    const u = await login('alice');
    const [p] = await store.select('products', { eq: { is_active: true }, limit: 1 });
    expect((await http.post('/api/shop/orders').set(u.auth).send({ product_id: p!.id, quantity: 9, delivery })).status).toBe(201);
  });
});

describe('boutique — paiement Pi', () => {
  async function ordered() {
    const s = await setup();
    const u = await s.login('alice');
    const [p] = (await s.http.get('/api/shop/products').set(u.auth)).body.products;
    const order = (await s.http.post('/api/shop/orders').set(u.auth).send({ product_id: p.id, quantity: 2, delivery })).body.order;
    s.pi.add('pay-1', { user_uid: 'pi-uid-alice', amount: order.total_pi, metadata: { order_id: order.id } });
    return { ...s, u, order };
  }

  it('parcours complet : approbation puis finalisation, commande payée, notifications', async () => {
    const { http, u, order, pi, store } = await ordered();
    expect((await http.post('/api/shop/payments/approve').set(u.auth).send({ paymentId: 'pay-1' })).status).toBe(200);
    expect(pi.calls).toContain('approve:pay-1');
    const done = await http.post('/api/shop/payments/complete').set(u.auth).send({ paymentId: 'pay-1', txid: 'tx-abc' });
    expect(done.status).toBe(200);
    expect(done.body.order.status).toBe('paid');
    expect(pi.calls).toContain('complete:pay-1');
    const [row] = await store.select('orders', { eq: { id: order.id } });
    expect(row!.pi_txid).toBe('tx-abc');
    expect(row!.paid_at).toBeTruthy();
    expect((await store.select('notifications', { eq: { user_id: u.id } })).some((n) => n.title === 'Paiement reçu')).toBe(true);
  });

  it('finalisation idempotente : un second rappel ne paie pas deux fois', async () => {
    const { http, u, pi } = await ordered();
    await http.post('/api/shop/payments/approve').set(u.auth).send({ paymentId: 'pay-1' });
    await http.post('/api/shop/payments/complete').set(u.auth).send({ paymentId: 'pay-1', txid: 'tx-abc' });
    const again = await http.post('/api/shop/payments/complete').set(u.auth).send({ paymentId: 'pay-1', txid: 'tx-abc' });
    expect(again.status).toBe(200);
    expect(pi.calls.filter((c) => c.startsWith('complete:')).length).toBe(1);
  });

  it('refuse un montant différent de la commande', async () => {
    const { http, u, order, pi } = await ordered();
    pi.add('pay-cheap', { user_uid: 'pi-uid-alice', amount: 0.0001, metadata: { order_id: order.id } });
    const r = await http.post('/api/shop/payments/approve').set(u.auth).send({ paymentId: 'pay-cheap' });
    expect(r.status).toBe(409);
    expect(pi.calls).not.toContain('approve:pay-cheap');
  });

  it('refuse le paiement d’un autre compte Pi et la commande d’un autre client', async () => {
    const { http, order, pi, login } = await ordered();
    const bob = await login('bob');
    expect((await http.post('/api/shop/payments/approve').set(bob.auth).send({ paymentId: 'pay-1' })).status).toBe(403);
    pi.add('pay-x', { user_uid: 'pi-uid-someone-else', amount: order.total_pi, metadata: { order_id: order.id } });
    const alice = await login('alice');
    expect((await http.post('/api/shop/payments/approve').set(alice.auth).send({ paymentId: 'pay-x' })).status).toBe(403);
  });

  it('paiement inconnu de Pi → 404 ; clé API absente → 503 ; commande annulée non payable', async () => {
    const { http, u, order } = await ordered();
    expect((await http.post('/api/shop/payments/approve').set(u.auth).send({ paymentId: 'nope' })).status).toBe(404);
    await http.post(`/api/shop/orders/${order.id}/cancel`).set(u.auth);
    expect((await http.post('/api/shop/payments/approve').set(u.auth).send({ paymentId: 'pay-1' })).status).toBe(409);
    const s = await setup(false);
    const a = await s.login('alice');
    expect((await s.http.post('/api/shop/payments/approve').set(a.auth).send({ paymentId: 'pay-1' })).status).toBe(503);
  });

  it('paiement en suspens repris à la connexion', async () => {
    const { http, u, pi } = await ordered();
    pi.payments.get('pay-1').transaction = { txid: 'tx-old', verified: true };
    pi.payments.get('pay-1').status.developer_approved = true;
    const r = await http.post('/api/shop/payments/incomplete').set(u.auth).send({ paymentId: 'pay-1' });
    expect(r.status).toBe(200);
    expect(r.body.state).toBe('completed');
    expect(r.body.order.status).toBe('paid');
  });
});

describe('administration de la boutique', () => {
  it('réservée aux administrateurs', async () => {
    const { http, login } = await setup();
    const u = await login('alice');
    expect((await http.get('/api/admin/shop/products').set(u.auth)).status).toBe(403);
    expect((await http.post('/api/admin/shop/products').set(u.auth).send({})).status).toBe(403);
    expect((await http.get('/api/admin/shop/orders').set(u.auth)).status).toBe(403);
  });

  it('crée, modifie, masque et supprime un produit ; refuse les champs inconnus et les prix invalides', async () => {
    const { http, login } = await setup();
    const boss = await login('boss');
    const cats = (await http.get('/api/admin/shop/products').set(boss.auth)).body.categories;
    const c = await http.post('/api/admin/shop/products').set(boss.auth).send({ title: 'Table dorée', price_pi: 0.25, category_id: cats[0].id, description: 'Test' });
    expect(c.status).toBe(201);
    const id = c.body.product.id;
    expect((await http.post('/api/admin/shop/products').set(boss.auth).send({ title: 'X!', price_pi: -1 })).status).toBe(400);
    expect((await http.post('/api/admin/shop/products').set(boss.auth).send({ title: 'Prix fou', price_pi: 0.123456 })).status).toBe(400);
    expect((await http.post('/api/admin/shop/products').set(boss.auth).send({ title: 'Champ extra', price_pi: 1, stock: 3 })).status).toBe(400);
    expect((await http.put(`/api/admin/shop/products/${id}`).set(boss.auth).send({ price_pi: 0.5, is_active: false })).body.product.price_pi).toBe(0.5);
    const visible = (await http.get('/api/shop/products').set(boss.auth)).body.products.map((p: any) => p.id);
    expect(visible).not.toContain(id);
    expect((await http.delete(`/api/admin/shop/products/${id}`).set(boss.auth)).status).toBe(204);
  });

  it('suit les commandes : transitions autorisées seulement, client notifié', async () => {
    const { http, login, store } = await setup();
    const boss = await login('boss');
    const alice = await login('alice');
    const [p] = (await http.get('/api/shop/products').set(alice.auth)).body.products;
    const o = (await http.post('/api/shop/orders').set(alice.auth).send({ product_id: p.id, quantity: 1, delivery })).body.order;
    expect((await http.patch(`/api/admin/shop/orders/${o.id}`).set(boss.auth).send({ status: 'delivered' })).status).toBe(409); // pas encore payée
    await store.update('orders', { eq: { id: o.id } }, { status: 'paid' });
    expect((await http.patch(`/api/admin/shop/orders/${o.id}`).set(boss.auth).send({ status: 'preparing', admin_note: 'Appel client' })).body.order.status).toBe('preparing');
    expect((await http.patch(`/api/admin/shop/orders/${o.id}`).set(boss.auth).send({ status: 'delivered' })).body.order.status).toBe('delivered');
    expect((await http.patch(`/api/admin/shop/orders/${o.id}`).set(boss.auth).send({ status: 'cancelled' })).status).toBe(409);
    expect((await http.patch(`/api/admin/shop/orders/${o.id}`).set(boss.auth).send({ status: 'paid' })).status).toBe(400);
    const list = await http.get('/api/admin/shop/orders').set(boss.auth);
    expect(list.body.orders[0].client_name).toBeTruthy();
    expect(list.body.orders[0].address).toContain('Rue 123');
    expect((await store.select('notifications', { eq: { user_id: alice.id } })).length).toBeGreaterThan(0);
    const sum = await http.get('/api/admin/shop/summary').set(boss.auth);
    expect(sum.body.paid_total_pi).toBeCloseTo(p.price_pi, 4);
  });
});
