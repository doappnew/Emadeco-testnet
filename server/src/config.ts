import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

const csv = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  PI_API_BASE: z.string().url().default('https://api.minepi.com/v2'),
  PI_API_KEY: z.string().optional(),
  PI_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  PI_VALIDATION_KEY: z.string().optional(),
  PI_SANDBOX: z.enum(['true', 'false']).optional(),
  ADMIN_PI_USERNAMES: z.string().optional(),
  DEMO_MODE: z.enum(['true', 'false']).optional(),
  WEB_DIR: z.string().optional(),
  STRICT_HEADERS: z.string().optional(),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  sessionSecret: string;
  supabase: { url: string; serviceKey: string } | null;
  pi: { apiBase: string; apiKey: string | null; network: 'testnet' | 'mainnet'; validationKey: string | null; sandbox: boolean };
  adminUsernames: string[];
  /** Connexion de démonstration (jamais active en production). */
  demoMode: boolean;
  /** STRICT_HEADERS=1 : applique helmet (CSP, COOP, CORP…). Désactivé par défaut (voir README, « Dépannage connexion Pi »). */
  strictHeaders: boolean;
  webDir: string;
}

export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): Config {
  // Une variable vide (cas d'un .env.example copié tel quel) équivaut à une variable absente.
  const env = Object.fromEntries(Object.entries(rawEnv).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration invalide : ${issues}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';
  const hasSupabase = Boolean(e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY);

  if (isProd) {
    const missing: string[] = [];
    if (!e.SESSION_SECRET) missing.push('SESSION_SECRET');
    if (!hasSupabase) missing.push('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length) throw new Error(`Variables obligatoires en production : ${missing.join(' ; ')}`);
  }
  if (e.SESSION_SECRET && e.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET doit contenir au moins 32 caractères.');
  }

  // Sans secret en développement : secret éphémère (les sessions sautent au redémarrage).
  const sessionSecret =
    e.SESSION_SECRET ?? `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}-ephemere-ephemere`;

  // Démo : jamais en production ; en dev, activée par défaut quand Supabase n'est pas configuré.
  const demoMode = !isProd && (e.DEMO_MODE ? e.DEMO_MODE === 'true' : !hasSupabase);

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    sessionSecret,
    supabase: hasSupabase ? { url: e.SUPABASE_URL!, serviceKey: e.SUPABASE_SERVICE_ROLE_KEY! } : null,
    pi: {
      apiBase: e.PI_API_BASE.replace(/\/$/, ''),
      apiKey: e.PI_API_KEY ?? null,
      network: e.PI_NETWORK,
      validationKey: e.PI_VALIDATION_KEY?.trim() || null,
      sandbox: e.PI_SANDBOX === 'true',
    },
    adminUsernames: csv(e.ADMIN_PI_USERNAMES),
    demoMode,
    strictHeaders: e.STRICT_HEADERS === '1',
    webDir: e.WEB_DIR ? path.resolve(e.WEB_DIR) : path.resolve(here, '../../web/dist'),
  };
}
