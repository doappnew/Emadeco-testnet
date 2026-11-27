import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { PIONEER_MAX } from '../src/lib/pioneer.js';
import { seedCategories, seedDemo } from '../src/store/demoData.js';
import { MemoryStore } from '../src/store/memory.js';
import { fakePiFetch } from './helpers.js';

const delivery = { recipient_name: 'Awa Koffi', phone: '+229 97 00 00 00', country: 'Bénin', city: 'Cotonou', address: 'Rue 123, quartier Fidjrossè' };

async function setup(network: 'testnet' | 'mainnet' = 'testnet') {
  const payments = new Map<string, any>();
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.endsWith('/me')) return fakePiFetch(url, init);
    const m = url.match(/\/payments\/([^/]+)(?:\/(approve|complete))?$/);
    const p = m && payments.get(m[1]!);
    if (!p) return new Response('{"error":"payment_not_found"}', { status: 404 });
    if (m![2] === 'approve') p.status.developer_approved = true;
    if (m![2] === 'complete') {
      p.status.developer_completed = true;
      p.transaction = { txid: JSON.parse(String(init?.body)).txid, verified: true };
    }
    return new Response(JSON.stringify(p), { status: 200 });
  };
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123456',
    ADMIN_PI_USERNAMES: 'boss',
    PI_API_KEY: 'test-api-key',
    PI_NETWORK: network,
  } as NodeJS.ProcessEnv);
  const store = new MemoryStore();
  await seedCategories(store);
  await seedDemo(store);
  const http = request(createApp({ config, store, fetchImpl }));
  const login = async (name: string) => {
    const r = await http.post('/api/auth/pi').send({ accessToken: `tok-${name}-0123456789` });
    return { auth: { Authorization: `Bearer ${r.body.token}` }, id: r.body.profile.id as string };
  };
  /** Parcours complet : commande, approbation, finalisation. */
  const pay = async (name: string, u: { auth: Record<string, string> }) => {
    const [p] = (await http.get('/api/shop/products').set(u.auth)).body.products;
    const order = (await http.post('/api/shop/orders').set(u.auth).send({ product_id: p.id, quantity: 1, delivery })).body.order;
    const pid = `pay-${name}`;
    payments.set(pid, { identifier: pid, user_uid: `pi-uid-${name}`, amount: order.total_pi, metadata: { order_id: order.id }, status: { developer_approved: false, developer_completed: false, cancelled: false, user_cancelled: false }, transaction: null });
    await http.post('/api/shop/payments/approve').set(u.auth).send({ paymentId: pid });
    const done = await http.post('/api/shop/payments/complete').set(u.auth).send({ paymentId: pid, txid: `tx-${name}` });
    return { order, done };
  };
  return { http, store, login, pay };
}

const noticeCount = async (store: MemoryStore, id: string) =>
  (await store.select('notifications', { eq: { user_id: id } })).filter((n) => n.title === 'Test de paiement Testnet').length;

describe('test de paiement des pionniers', () => {
  it('première connexion : une seule notification et une seule ligne par compte', async () => {
    const { login, store } = await setup();
    const a = await login('alice');
    await login('alice');
    await login('alice');
    expect(await noticeCount(store, a.id)).toBe(1);
    expect(await store.count('pioneer_test', { eq: { profile_id: a.id } })).toBe(1);
    const [n] = (await store.select('notifications', { eq: { user_id: a.id } })).filter((x) => x.title === 'Test de paiement Testnet');
    expect(n!.body).toBe('Aidez-nous à valider l’application : passez une commande d’essai avec un produit de la boutique et payez-la en Pi Testnet. Aucun Pi réel n’est utilisé.');
    const b = await login('bob');
    expect(await noticeCount(store, b.id)).toBe(1);
  });

  it('paiement vérifié : pionnier validé une seule fois par compte', async () => {
    const { http, login, pay, store } = await setup();
    const a = await login('alice');
    const s0 = await http.get('/api/pioneer/status').set(a.auth);
    expect(s0.body).toMatchObject({ enabled: true, login_ok: true, paid_ok: false, validated: 0, max: 5 });
    const { order } = await pay('alice', a);
    const [row] = await store.select('pioneer_test', { eq: { profile_id: a.id } });
    expect(row).toMatchObject({ paid_ok: true, order_id: order.id });
    expect(row!.validated_at).toBeTruthy();
    const first = row!.validated_at;
    await pay('alice2', a).catch(() => undefined); // seconde commande payée par le même compte
    const [again] = await store.select('pioneer_test', { eq: { profile_id: a.id } });
    expect(again!.validated_at).toBe(first);
    expect(again!.order_id).toBe(order.id);
    expect(await store.count('pioneer_test', { eq: { profile_id: a.id } })).toBe(1);
    expect((await http.get('/api/pioneer/status').set(a.auth)).body).toMatchObject({ paid_ok: true, validated: 1 });
  });

  it('commande non payée : aucune validation', async () => {
    const { http, login, store } = await setup();
    const a = await login('alice');
    const [p] = (await http.get('/api/shop/products').set(a.auth)).body.products;
    await http.post('/api/shop/orders').set(a.auth).send({ product_id: p.id, quantity: 1, delivery });
    expect(await store.count('pioneer_test', { eq: { paid_ok: true } })).toBe(0);
  });

  it('plafond de 5 : le 6e compte n’est pas ajouté, l’application continue de fonctionner', async () => {
    const { http, login, pay, store } = await setup();
    const names = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
    for (const n of names) {
      const u = await login(n);
      const { done } = await pay(n, u);
      expect(done.status).toBe(200);
      expect(done.body.order.status).toBe('paid'); // le 6e paiement reste normal
    }
    expect(PIONEER_MAX).toBe(5);
    expect(await store.count('pioneer_test', { eq: { paid_ok: true } })).toBe(5);
    const u6 = await login('u6');
    const st = await http.get('/api/pioneer/status').set(u6.auth);
    expect(st.body).toMatchObject({ paid_ok: false, validated: 5, max: 5 });
  });

  it('administration : compteur et liste des pionniers, réservés à l’administrateur', async () => {
    const { http, login, pay } = await setup();
    const a = await login('alice');
    await pay('alice', a);
    expect((await http.get('/api/admin/pioneers').set(a.auth)).status).toBe(403);
    const boss = await login('boss');
    const r = await http.get('/api/admin/pioneers').set(boss.auth);
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(1);
    expect(r.body.max).toBe(5);
    expect(r.body.pioneers[0].pi_username).toBe('alice');
    expect(r.body.pioneers[0].validated_at).toBeTruthy();
  });

  it('hors Testnet : ni notification ni validation', async () => {
    const { http, login, pay, store } = await setup('mainnet');
    const a = await login('alice');
    await pay('alice', a);
    expect(await noticeCount(store, a.id)).toBe(0);
    expect(await store.count('pioneer_test', {})).toBe(0);
    expect((await http.get('/api/pioneer/status').set(a.auth)).body.enabled).toBe(false);
  });
});
