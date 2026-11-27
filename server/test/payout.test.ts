import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { PAYOUT_NOTICE } from '../src/lib/payout.js';
import { isSeedFormat, type StellarPayArgs } from '../src/lib/stellar.js';
import { seedCategories, seedDemo } from '../src/store/demoData.js';
import { MemoryStore } from '../src/store/memory.js';
import { fakePiFetch } from './helpers.js';

const SEED = 'S' + 'A'.repeat(55); // format valide, valeur factice
const BASE = { NODE_ENV: 'test', SESSION_SECRET: 'test-secret-test-secret-test-secret-123456', ADMIN_PI_USERNAMES: 'boss' };
const ON = { ...BASE, PI_API_KEY: 'test-api-key', PI_WALLET_SEED: SEED, TESTNET_PAYOUT: '1', PI_NETWORK: 'testnet' };
const delivery = { recipient_name: 'Awa Koffi', phone: '+229 97 00 00 00', country: 'Bénin', city: 'Cotonou', address: 'Rue 123, quartier Fidjrossè' };

async function setup(env: Record<string, string> = ON, opts: { network?: string; failSubmit?: boolean; failComplete?: boolean } = {}) {
  let n = 0;
  const created: any[] = [];
  const cancelled: string[] = [];
  const completed: string[] = [];
  const submits: StellarPayArgs[] = [];
  const payments = new Map<string, any>();
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.endsWith('/me')) return fakePiFetch(url, init);
    if ((init?.headers as Record<string, string>)?.Authorization !== 'Key test-api-key') return new Response('{"error":"unauthorized"}', { status: 401 });
    if (init?.method === 'POST' && url.endsWith('/payments')) {
      const body = JSON.parse(String(init.body)).payment;
      created.push(body);
      const p = { identifier: `a2u-${++n}`, user_uid: body.uid, amount: body.amount, from_address: 'GAPPWALLET', to_address: `GUSER${n}`, network: opts.network ?? 'Pi Testnet', status: {} };
      payments.set(p.identifier, p);
      return new Response(JSON.stringify(p), { status: 200 });
    }
    const m = url.match(/\/payments\/([^/]+)\/(cancel|complete)$/);
    if (m && m[2] === 'cancel') {
      cancelled.push(m[1]!);
      return new Response('{}', { status: 200 });
    }
    if (m && m[2] === 'complete') {
      if (opts.failComplete) return new Response('{"error":"x"}', { status: 500 });
      completed.push(`${m[1]}:${JSON.parse(String(init?.body)).txid}`);
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const stellarSubmit = async (a: StellarPayArgs) => {
    submits.push(a);
    await new Promise((r) => setTimeout(r, 5));
    if (opts.failSubmit) throw new Error('horizon down');
    return `tx-${submits.length}`;
  };
  const config = loadConfig(env as NodeJS.ProcessEnv);
  const store = new MemoryStore();
  await seedCategories(store);
  await seedDemo(store);
  const http = request(createApp({ config, store, fetchImpl, stellarSubmit }));
  const login = async (name: string) => {
    const r = await http.post('/api/auth/pi').send({ accessToken: `tok-${name}-0123456789` });
    return { auth: { Authorization: `Bearer ${r.body.token}` }, id: r.body.profile.id as string };
  };
  const send = (u: { auth: Record<string, string> }, body: object = {}) => http.post('/api/testnet-payout').set(u.auth).send(body);
  const status = async (u: { auth: Record<string, string> }) => (await http.get('/api/testnet-payout/status').set(u.auth)).body;
  return { http, store, login, send, status, created, cancelled, completed, submits };
}

const notices = async (store: MemoryStore, id: string) =>
  (await store.select('notifications', { eq: { user_id: id } })).filter((n) => n.title === PAYOUT_NOTICE.title).length;

describe('test de réception A2U — route fermée sans configuration', () => {
  const closedCases: [string, Record<string, string>][] = [
    ['TESTNET_PAYOUT absent', { ...ON, TESTNET_PAYOUT: '0' }],
    ['PI_WALLET_SEED absent', { ...BASE, PI_API_KEY: 'test-api-key', TESTNET_PAYOUT: '1' }],
    ['seed au mauvais format', { ...ON, PI_WALLET_SEED: 'pas-un-seed' }],
    ['PI_API_KEY absente', { ...BASE, PI_WALLET_SEED: SEED, TESTNET_PAYOUT: '1' }],
    ['réseau non Testnet', { ...ON, PI_NETWORK: 'mainnet' }],
  ];
  for (const [label, env] of closedCases) {
    it(`404 « Indisponible » : ${label}`, async () => {
      const s = await setup(env);
      const u = await s.login('alice');
      const r = await s.send(u);
      expect(r.status).toBe(404);
      expect(r.body.error.message).toBe('Indisponible');
      expect(s.created).toHaveLength(0);
      expect(s.submits).toHaveLength(0);
      const st = await s.status(u);
      expect(st.available).toBe(false);
      expect(st.offer).toBe(false);
      expect(await notices(s.store, u.id)).toBe(0);
    });
  }
  it('exige une connexion', async () => {
    const s = await setup();
    expect((await s.http.post('/api/testnet-payout').send({})).status).toBe(401);
  });
  it('reconnaît un format de seed valide', () => {
    expect(isSeedFormat(SEED)).toBe(true);
    expect(isSeedFormat('S123')).toBe(false);
    expect(isSeedFormat(null)).toBe(false);
  });
});

describe('test de réception A2U — envoi', () => {
  it('envoie un petit montant fixé par le serveur, finalise et enregistre txid', async () => {
    const s = await setup();
    const u = await s.login('alice');
    const r = await s.send(u, { amount: 99, uid: 'pi-uid-bob' }); // le navigateur ne choisit ni montant ni destinataire
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: 'completed', amount: 0.1 });
    expect(s.created).toEqual([{ amount: 0.1, memo: expect.any(String), metadata: { kind: 'testnet_payout' }, uid: 'pi-uid-alice' }]);
    expect(s.submits[0]).toMatchObject({ seed: SEED, fromAddress: 'GAPPWALLET', toAddress: 'GUSER1', amount: '0.1000000', memo: 'a2u-1', networkPassphrase: 'Pi Testnet' });
    expect(s.completed).toEqual(['a2u-1:tx-1']);
    const [row] = await s.store.select('testnet_payouts', { eq: { profile_id: u.id } });
    expect(row).toMatchObject({ status: 'completed', payment_id: 'a2u-1', txid: 'tx-1', amount: 0.1 });
  });

  it('le montant ne dépasse jamais 1 Pi, même mal configuré', async () => {
    const s = await setup({ ...ON, TESTNET_PAYOUT_AMOUNT: '50' });
    await s.send(await s.login('alice'));
    expect(s.created[0].amount).toBe(1);
    expect(loadConfig({ ...ON, TESTNET_PAYOUT_AMOUNT: 'abc' } as NodeJS.ProcessEnv).testnetPayout.sendPi).toBe(0.1);
    expect(loadConfig({ ...ON, TESTNET_PAYOUT_AMOUNT: '0.25' } as NodeJS.ProcessEnv).testnetPayout.sendPi).toBe(0.25);
  });

  it('un seul envoi par compte (409), y compris deux requêtes simultanées', async () => {
    const s = await setup();
    const u = await s.login('alice');
    const [a, b] = await Promise.all([s.send(u), s.send(u)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await s.send(u)).status).toBe(409);
    expect(s.created).toHaveLength(1);
    expect(s.submits).toHaveLength(1);
    expect(await s.store.count('testnet_payouts', { eq: { profile_id: u.id } })).toBe(1);
  });

  it('plafond de 5 pionniers : le 6e reçoit 403 et aucun paiement n’est créé', async () => {
    const s = await setup();
    for (const n of ['u1', 'u2', 'u3', 'u4', 'u5']) expect((await s.send(await s.login(n))).status).toBe(200);
    const u6 = await s.login('u6');
    const r = await s.send(u6);
    expect(r.status).toBe(403);
    expect(r.body.error.message).toBe('Le nombre maximal de pionniers du test est atteint.');
    expect(s.created).toHaveLength(5);
    expect(await s.store.count('testnet_payouts', {})).toBe(5);
  });

  it('plafond tenu même avec 8 demandes simultanées de comptes différents', async () => {
    const s = await setup();
    const users = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => s.login(n)));
    const rs = await Promise.all(users.map((u) => s.send(u)));
    expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(5);
    expect(await s.store.count('testnet_payouts', { neq: { status: 'failed' } })).toBeLessThanOrEqual(5);
  });

  it('paiement créé sur un autre réseau que Pi Testnet : annulé, aucun envoi, compte libéré', async () => {
    const s = await setup(ON, { network: 'Pi Network' });
    const u = await s.login('alice');
    const r = await s.send(u);
    expect(r.status).toBe(502);
    expect(s.cancelled).toEqual(['a2u-1']);
    expect(s.submits).toHaveLength(0);
    const [row] = await s.store.select('testnet_payouts', { eq: { profile_id: u.id } });
    expect(row!.status).toBe('failed');
  });

  it('échec de l’envoi : statut « failed », paiement annulé, message propre sans secret, nouvel essai possible', async () => {
    const s = await setup(ON, { failSubmit: true });
    const u = await s.login('alice');
    const r = await s.send(u);
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toMatch(new RegExp(`${SEED}|test-api-key|horizon`));
    expect(s.cancelled).toEqual(['a2u-1']);
    const [row] = await s.store.select('testnet_payouts', { eq: { profile_id: u.id } });
    expect(row!.status).toBe('failed');
    expect((await s.status(u)).offer).toBe(true); // un envoi « failed » ne compte pas dans le plafond
    expect(await s.store.count('testnet_payouts', { neq: { status: 'failed' } })).toBe(0);
  });

  it('transaction partie mais finalisation en échec : pas de second envoi possible', async () => {
    const s = await setup(ON, { failComplete: true });
    const u = await s.login('alice');
    expect((await s.send(u)).status).toBe(502);
    const [row] = await s.store.select('testnet_payouts', { eq: { profile_id: u.id } });
    expect(row).toMatchObject({ status: 'pending', txid: 'tx-1' });
    expect((await s.send(u)).status).toBe(409);
    expect(s.submits).toHaveLength(1);
  });

  it('aucun secret dans les journaux', async () => {
    const lines: string[] = [];
    const spy = (c: 'log' | 'error' | 'warn' | 'info') => {
      const orig = console[c];
      console[c] = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
      return () => (console[c] = orig);
    };
    const undo = (['log', 'error', 'warn', 'info'] as const).map(spy);
    try {
      const s = await setup(ON, { failSubmit: true });
      await s.send(await s.login('alice'));
    } finally {
      undo.forEach((f) => f());
    }
    expect(lines.join('\n')).not.toMatch(new RegExp(`${SEED}|test-api-key`));
  });
});

describe('test de réception A2U — boutons, bannière et notification', () => {
  it('statut : proposé, puis « reçu » après l’envoi (le bouton disparaît)', async () => {
    const s = await setup();
    const u = await s.login('alice');
    expect(await s.status(u)).toMatchObject({ available: true, closed: false, offer: true, received: false, served: 0, max: 5 });
    await s.send(u);
    expect(await s.status(u)).toMatchObject({ offer: false, received: true, served: 1 });
  });

  it('notification à la première connexion : une seule fois par compte', async () => {
    const s = await setup();
    const a = await s.login('alice');
    await s.login('alice');
    await s.login('alice');
    expect(await notices(s.store, a.id)).toBe(1);
    const [n] = (await s.store.select('notifications', { eq: { user_id: a.id } })).filter((x) => x.title === PAYOUT_NOTICE.title);
    expect(n!.body).toContain('cinq pionniers peuvent recevoir un petit envoi de test');
    expect(n!.body).toContain('Aucun Pi réel n’est utilisé.');
  });

  it('pas de notification après réception', async () => {
    const s = await setup();
    const u = await s.login('alice');
    await s.send(u);
    await s.store.remove('notifications', { eq: { user_id: u.id } });
    await s.login('alice');
    expect(await notices(s.store, u.id)).toBe(0);
  });

  it('plus de bouton ni de notification quand les 5 pionniers sont servis', async () => {
    const s = await setup();
    for (const n of ['u1', 'u2', 'u3', 'u4', 'u5']) await s.send(await s.login(n));
    const late = await s.login('late');
    expect(await notices(s.store, late.id)).toBe(0);
    expect(await s.status(late)).toMatchObject({ offer: false, served: 5, max: 5 });
  });

  it('administration : liste, compteur et clôture qui retire tout pour tout le monde', async () => {
    const s = await setup();
    const a = await s.login('alice');
    const early = await s.login('early');
    await s.send(a);
    const boss = await s.login('boss');
    expect((await s.http.get('/api/admin/testnet-payout').set(a.auth)).status).toBe(403);
    expect((await s.http.post('/api/admin/testnet-payout/close').set(a.auth)).status).toBe(403);
    const list = (await s.http.get('/api/admin/testnet-payout').set(boss.auth)).body;
    expect(list).toMatchObject({ served: 1, max: 5, closed: false });
    expect(list.payouts[0]).toMatchObject({ pi_username: 'alice', status: 'completed' });
    expect((await s.http.post('/api/admin/testnet-payout/close').set(boss.auth)).status).toBe(200);
    expect(await s.status(early)).toMatchObject({ closed: true, offer: false });
    expect((await s.send(early)).status).toBe(404);
    const fresh = await s.login('fresh');
    expect(await notices(s.store, fresh.id)).toBe(0);
    expect((await s.http.get('/api/admin/testnet-payout').set(boss.auth)).body.closed).toBe(true);
  });

  it('test de paiement (U2A) : simple liste de contrôle, sans plafond ni compteur', async () => {
    const s = await setup();
    const u = await s.login('alice');
    const st = await s.status(u);
    expect(st.payment_check).toEqual({ enabled: true, done: false });
    expect(JSON.stringify(st.payment_check)).not.toMatch(/max|validated|valid/);
    const [p] = await s.store.select('products', { eq: { is_active: true }, limit: 1 });
    const o = (await s.http.post('/api/shop/orders').set(u.auth).send({ product_id: p!.id, quantity: 1, delivery })).body.order;
    await s.store.update('orders', { eq: { id: o.id } }, { status: 'paid' });
    expect((await s.status(u)).payment_check.done).toBe(true);
  });
});
