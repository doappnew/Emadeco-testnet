import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { redact } from '../src/lib/logger.js';
import { verifyPiAccessToken } from '../src/lib/pi.js';
import { DB_TRANSITIONS, REQUEST_STATUSES, canTransition, nextStatuses, type Actor } from '../src/lib/requestStatus.js';
import { signSession, verifySession } from '../src/lib/session.js';
import { createRequestSchema } from '../src/lib/validation.js';
import { fakePiFetch, futureDate, validRequest } from './helpers.js';

describe('machine à états des demandes', () => {
  it('chaque transition d’un acteur est aussi autorisée par la base', () => {
    for (const actor of ['client', 'provider'] as Actor[]) {
      for (const from of REQUEST_STATUSES) {
        for (const to of nextStatuses(actor, from)) {
          expect(DB_TRANSITIONS[from]).toContain(to);
        }
      }
    }
  });
  it('« clôturée » est terminale pour tout le monde', () => {
    for (const actor of ['client', 'provider', 'admin'] as Actor[]) expect(nextStatuses(actor, 'closed')).toEqual([]);
  });
  it('le client ne peut ni confirmer, ni refuser, ni examiner', () => {
    for (const to of ['confirmed', 'declined', 'in_review'] as const) expect(canTransition('client', 'sent', to)).toBe(false);
  });
  it('le prestataire ne peut pas simuler la réponse du client', () => {
    expect(canTransition('provider', 'info_requested', 'response_received')).toBe(false);
    expect(canTransition('client', 'info_requested', 'response_received')).toBe(true);
  });
  it('parcours nominal prestataire : envoyée → examen → confirmée → clôturée', () => {
    expect(canTransition('provider', 'sent', 'in_review')).toBe(true);
    expect(canTransition('provider', 'in_review', 'confirmed')).toBe(true);
    expect(canTransition('provider', 'confirmed', 'closed')).toBe(true);
  });
});

describe('vérification du jeton Pi', () => {
  const opts = { apiBase: 'https://api.minepi.com/v2', fetchImpl: fakePiFetch };
  it('retourne uid et username fournis par l’API Pi', async () => {
    await expect(verifyPiAccessToken('tok-alice-0123456789', opts)).resolves.toEqual({ uid: 'pi-uid-alice', username: 'alice' });
  });
  it('appelle GET /me avec Authorization: Bearer', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    await verifyPiAccessToken('tok-bob-0123456789', {
      apiBase: 'https://api.minepi.com/v2',
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return fakePiFetch(url, init);
      },
    });
    expect(seen!.url).toBe('https://api.minepi.com/v2/me');
    expect(seen!.init?.method).toBe('GET');
    expect((seen!.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-bob-0123456789');
  });
  it('refuse un jeton rejeté par Pi (401)', async () => {
    await expect(verifyPiAccessToken('bad-xxxxxxxxxxxx', opts)).rejects.toMatchObject({ status: 401 });
  });
  it('signale une indisponibilité Pi en 502', async () => {
    await expect(verifyPiAccessToken('down-xxxxxxxxxxxx', opts)).rejects.toMatchObject({ status: 502 });
  });
  it('refuse les jetons mal formés sans appeler Pi', async () => {
    let called = false;
    const spy = async () => {
      called = true;
      return new Response('{}');
    };
    for (const t of ['', 'court', 'a b c d e f g h', 12345, null, 'x'.repeat(5000)]) {
      await expect(verifyPiAccessToken(t, { apiBase: 'x', fetchImpl: spy })).rejects.toMatchObject({ status: 401 });
    }
    expect(called).toBe(false);
  });
  it('refuse une réponse sans uid/username', async () => {
    const f = async () => new Response('{"uid":"x"}', { status: 200 });
    await expect(verifyPiAccessToken('tok-zed-0123456789', { apiBase: 'x', fetchImpl: f })).rejects.toMatchObject({ status: 502 });
  });
});

describe('session', () => {
  const secret = 'a'.repeat(40);
  it('signe et vérifie', () => {
    expect(verifySession(signSession('u-1', secret), secret)).toBe('u-1');
  });
  it('rejette une signature différente ou un jeton altéré', () => {
    const t = signSession('u-1', secret);
    expect(verifySession(t, 'b'.repeat(40))).toBeNull();
    expect(verifySession(`${t}x`, secret)).toBeNull();
    expect(verifySession('n.importe.quoi', secret)).toBeNull();
  });
});

describe('journalisation', () => {
  it('masque jetons, clés et en-têtes d’autorisation', () => {
    const out = JSON.stringify(redact({ accessToken: 'abc', headers: { authorization: 'Bearer secretsecret123' }, PI_API_KEY: 'k', note: 'Key abcdefghijkl123' }));
    expect(out).not.toContain('abc"');
    expect(out).not.toContain('secretsecret123');
    expect(out).not.toContain('abcdefghijkl123');
    expect(out).toContain('[masqué]');
  });
});

describe('configuration', () => {
  it('exige les secrets en production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/SESSION_SECRET/);
  });
  it('désactive toujours la démo en production', () => {
    const c = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 's'.repeat(40),
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(30),
      DEMO_MODE: 'true',
    } as NodeJS.ProcessEnv);
    expect(c.demoMode).toBe(false);
  });
  it('traite les variables vides (.env.example copié) comme absentes', () => {
    const c = loadConfig({ NODE_ENV: 'development', SESSION_SECRET: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', DEMO_MODE: '', PI_API_BASE: '', PORT: '' } as NodeJS.ProcessEnv);
    expect(c.supabase).toBeNull();
    expect(c.demoMode).toBe(true);
    expect(c.pi.apiBase).toBe('https://api.minepi.com/v2');
    expect(c.port).toBe(3000);
  });
  it('refuse un SESSION_SECRET trop court', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'court' } as NodeJS.ProcessEnv)).toThrow();
  });
});

describe('schéma de demande : aucun champ financier', () => {
  it('accepte une demande valide', () => {
    expect(createRequestSchema.safeParse(validRequest()).success).toBe(true);
  });
  it('refuse toute clé inconnue, quel que soit son nom', () => {
    for (const key of ['budget', 'price', 'prix', 'tarif', 'amount', 'estimate', 'montant', 'devis']) {
      const r = createRequestSchema.safeParse({ ...validRequest(), [key]: 100 });
      expect(r.success, key).toBe(false);
    }
  });
  it('refuse une date passée et un nombre d’invités absurde', () => {
    expect(createRequestSchema.safeParse(validRequest({ event_date: '2020-01-01' })).success).toBe(false);
    expect(createRequestSchema.safeParse(validRequest({ guests_approx: 0 })).success).toBe(false);
    expect(createRequestSchema.safeParse(validRequest({ event_date: futureDate(1) })).success).toBe(true);
  });
  it('retire les caractères de contrôle', () => {
    const r = createRequestSchema.parse(validRequest({ event_type: ' Mariage\u0000 ' }));
    expect(r.event_type).toBe('Mariage');
  });
});
