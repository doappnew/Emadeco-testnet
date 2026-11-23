import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { setLoggerSilent } from '../src/lib/logger.js';
import { seedCategories, seedDemo } from '../src/store/demoData.js';
import { MemoryStore } from '../src/store/memory.js';

setLoggerSilent(true);

/** Fausse API Pi : le jeton « tok-<nom>-… » correspond à l'utilisateur <nom> ; « bad-… » est refusé. */
export const fakePiFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
  const token = auth.replace('Bearer ', '');
  if (!url.endsWith('/me')) return new Response('{}', { status: 404 });
  if (token.startsWith('bad-')) return new Response('{"error":"unauthorized"}', { status: 401 });
  if (token.startsWith('down-')) return new Response('oops', { status: 503 });
  const name = token.split('-')[1];
  return new Response(JSON.stringify({ uid: `pi-uid-${name}`, username: name }), { status: 200, headers: { 'content-type': 'application/json' } });
};

export async function makeApp(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123456',
    ADMIN_PI_USERNAMES: 'boss',
    ...env,
  } as NodeJS.ProcessEnv);
  const store = new MemoryStore();
  await seedCategories(store);
  await seedDemo(store);
  const app = createApp({ config, store, fetchImpl: fakePiFetch });
  return { app, store, config, http: request(app) };
}

export type Harness = Awaited<ReturnType<typeof makeApp>>;

export async function loginPi(h: Harness, username: string) {
  const res = await h.http.post('/api/auth/pi').send({ accessToken: `tok-${username}-0123456789` });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, profile: res.body.profile as { id: string }, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export async function loginDemo(h: Harness, role: 'client' | 'provider' | 'admin') {
  const res = await h.http.post('/api/auth/demo').send({ role });
  if (res.status !== 200) throw new Error(`demo ${role}: ${res.status}`);
  return { token: res.body.token as string, profile: res.body.profile as { id: string }, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export const futureDate = (days = 30) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

export const DEMO_PROVIDER_ID = '00000000-0000-4000-8000-0000000000b1';
export const DEMO_PROVIDER_2_ID = '00000000-0000-4000-8000-0000000000b2';

export const validRequest = (over: Record<string, unknown> = {}) => ({
  provider_id: DEMO_PROVIDER_ID,
  event_type: 'Mariage',
  event_date: futureDate(),
  event_location: 'Cotonou, salle Les Palmiers',
  guests_approx: 150,
  theme: 'Ivoire et or',
  colors: 'Ivoire, vert, or',
  requested_services: 'Arche, table d’honneur',
  details: 'Cérémonie en fin d’après-midi.',
  ...over,
});
