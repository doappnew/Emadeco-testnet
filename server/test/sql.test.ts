/**
 * Valide les migrations SQL sur un vrai PostgreSQL (PGlite) : schéma, contraintes, trigger de statuts
 * et surtout les politiques RLS. Les schémas « auth » et « storage » de Supabase y sont simulés.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

const A = '10000000-0000-4000-8000-000000000001'; // alice, cliente
const B = '10000000-0000-4000-8000-000000000002'; // bob, client
const P = '10000000-0000-4000-8000-000000000003'; // prestataire approuvé
const P2 = '10000000-0000-4000-8000-000000000005'; // prestataire en attente
const ADM = '10000000-0000-4000-8000-000000000004'; // admin
const PP = '20000000-0000-4000-8000-000000000001';
const PP2 = '20000000-0000-4000-8000-000000000002';
const REQ = '30000000-0000-4000-8000-000000000001';

let db: PGlite;

/** Exécute `fn` avec le rôle Postgres « authenticated » (ou anon) et l'utilisateur indiqué (comme PostgREST). */
async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}
const q = async (sql: string) => (await db.query(sql)).rows as Record<string, any>[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    grant usage on schema public, auth to anon, authenticated;
  `);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    // pgcrypto est fourni par Supabase ; gen_random_uuid() est natif dans PostgreSQL 13+.
    await db.exec(readFileSync(path.join(dir, f), 'utf8').replace(/create extension if not exists pgcrypto;/g, ''));
  }
  await db.exec('grant select, insert, update, delete on all tables in schema public to anon, authenticated;');

  await db.exec(`
    insert into profiles (id, pi_uid, pi_username, role) values
      ('${A}','u-a','alice','client'), ('${B}','u-b','bob','client'),
      ('${P}','u-p','prestataire','provider'), ('${P2}','u-p2','nouveau','provider'), ('${ADM}','u-adm','admin','admin');
    insert into provider_profiles (id, profile_id, business_name, status) values
      ('${PP}','${P}','Déco Approuvée','approved'), ('${PP2}','${P2}','Déco En Attente','pending');
    insert into service_requests (id, client_id, provider_id, event_type, event_date, event_location)
      values ('${REQ}','${A}','${PP}','Mariage', current_date + 30, 'Cotonou');
    insert into request_messages (request_id, sender_id, body) values ('${REQ}','${A}','Bonjour');
    insert into notifications (user_id, type, title) values ('${A}','system','Pour alice'), ('${B}','system','Pour bob');
    insert into favorites (user_id, provider_id) values ('${A}','${PP}');
    insert into portfolio_items (provider_id, title, image_path, moderation_status) values
      ('${PP}','Publiée','a.webp','approved'), ('${PP}','En attente','b.webp','pending');
    insert into reports (reporter_id, target_type, target_id, reason) values ('${A}','provider','${PP}','test');
    insert into admin_logs (admin_id, action) values ('${ADM}','test');
  `);
});
afterAll(async () => {
  await db.close();
});

describe('schéma', () => {
  it('toutes les migrations s’appliquent et créent les 13 tables prévues', async () => {
    const t = (await q(`select tablename from pg_tables where schemaname='public' order by 1`)).map((r) => r.tablename);
    expect(t).toEqual(
      ['admin_logs', 'favorites', 'notifications', 'portfolio_items', 'profiles', 'provider_profiles', 'reports', 'request_messages', 'service_categories', 'service_requests', 'services', 'products', 'orders'].sort(),
    );
  });
  it('AUCUNE colonne financière hors boutique (demandes, prestataires, services : ni budget, ni tarif, ni devis…)', async () => {
    const cols = await q(`select table_name, column_name from information_schema.columns where table_schema='public' and table_name not in ('products','orders')
      and column_name ~* '(budget|price|prix|tarif|amount|montant|cost|cout|coût|devis|estimat|fee|frais|currency|devise)'`);
    expect(cols).toEqual([]);
  });
  it('RLS est activée sur chaque table', async () => {
    const off = await q(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(off).toEqual([]);
  });
  it('les catégories de référence sont chargées et les buckets de stockage créés', async () => {
    expect((await q('select count(*)::int as n from service_categories'))[0]!.n).toBe(10);
    expect((await q(`select id, public from storage.buckets order by id`))).toEqual([
      { id: 'inspiration', public: false },
      { id: 'portfolio', public: true },
    ]);
  });
  it('contraintes : date, invités, statut et favori à cible unique', async () => {
    await expect(db.exec(`insert into service_requests (client_id, provider_id, event_type, event_date, event_location, guests_approx) values ('${A}','${PP}','XX','2030-01-01','Lieu',0)`)).rejects.toThrow();
    await expect(db.exec(`insert into favorites (user_id) values ('${A}')`)).rejects.toThrow();
    await expect(db.exec(`insert into favorites (user_id, provider_id, portfolio_item_id) select '${B}','${PP}', id from portfolio_items limit 1`)).rejects.toThrow();
  });
});

describe('transitions de statut (trigger)', () => {
  it('autorise le parcours nominal et refuse les retours en arrière', async () => {
    await db.exec(`update service_requests set status='in_review' where id='${REQ}'`);
    await db.exec(`update service_requests set status='confirmed' where id='${REQ}'`);
    await expect(db.exec(`update service_requests set status='sent' where id='${REQ}'`)).rejects.toThrow(/Transition de statut interdite/);
    await db.exec(`update service_requests set status='closed' where id='${REQ}'`);
    await expect(db.exec(`update service_requests set status='in_review' where id='${REQ}'`)).rejects.toThrow(/interdite/);
    // remise à zéro pour la suite (contourne le trigger)
    await db.exec(`alter table service_requests disable trigger service_requests_transition; update service_requests set status='sent' where id='${REQ}'; alter table service_requests enable trigger service_requests_transition;`);
  });
});

describe('RLS — lecture', () => {
  it('anonyme : catalogue public seulement', async () => {
    await as(null, async () => {
      expect((await q('select count(*)::int n from service_categories'))[0]!.n).toBe(10);
      expect((await q('select business_name from provider_profiles')).map((r) => r.business_name)).toEqual(['Déco Approuvée']);
      expect((await q('select title from portfolio_items')).map((r) => r.title)).toEqual(['Publiée']);
      for (const t of ['service_requests', 'request_messages', 'notifications', 'favorites', 'reports', 'admin_logs', 'profiles']) {
        expect((await q(`select count(*)::int n from ${t}`))[0]!.n, t).toBe(0);
      }
    });
  });
  it('une demande n’est visible que par son client, son prestataire et un admin', async () => {
    const count = (u: string) => as(u, async () => (await q('select count(*)::int n from service_requests'))[0]!.n);
    expect(await count(A)).toBe(1);
    expect(await count(P)).toBe(1);
    expect(await count(ADM)).toBe(1);
    expect(await count(B)).toBe(0); // autre client
    expect(await count(P2)).toBe(0); // autre prestataire
  });
  it('les messages suivent la même règle', async () => {
    const count = (u: string) => as(u, async () => (await q('select count(*)::int n from request_messages'))[0]!.n);
    expect([await count(A), await count(P), await count(B), await count(P2)]).toEqual([1, 1, 0, 0]);
  });
  it('notifications, favoris, signalements et profils sont privés', async () => {
    await as(B, async () => {
      expect((await q('select title from notifications')).map((r) => r.title)).toEqual(['Pour bob']);
      expect((await q('select count(*)::int n from favorites'))[0]!.n).toBe(0);
      expect((await q('select count(*)::int n from reports'))[0]!.n).toBe(0);
      expect((await q('select pi_username from profiles')).map((r) => r.pi_username)).toEqual(['bob']);
    });
    await as(A, async () => expect((await q('select count(*)::int n from favorites'))[0]!.n).toBe(1));
  });
  it('un prestataire en attente et ses photos sont visibles de lui seul (et des admins)', async () => {
    await as(P2, async () => expect((await q('select business_name from provider_profiles order by 1')).length).toBe(2));
    await as(B, async () => expect((await q('select business_name from provider_profiles')).length).toBe(1));
    await as(P, async () => expect((await q('select title from portfolio_items')).length).toBe(2)); // ses deux photos
    await as(ADM, async () => expect((await q('select * from admin_logs')).length).toBe(1));
    await as(A, async () => expect((await q('select * from admin_logs')).length).toBe(0));
  });
});

describe('RLS — écriture', () => {
  it('on ne peut créer une demande qu’en son nom et au statut « envoyée »', async () => {
    await as(B, async () => {
      await expect(db.exec(`insert into service_requests (client_id, provider_id, event_type, event_date, event_location) values ('${A}','${PP}','XX',current_date+1,'Lieu')`)).rejects.toThrow(/row-level security/);
      await expect(db.exec(`insert into service_requests (client_id, provider_id, event_type, event_date, event_location, status) values ('${B}','${PP}','X',current_date+1,'Lieu','confirmed')`)).rejects.toThrow(/row-level security/);
      await db.exec(`insert into service_requests (client_id, provider_id, event_type, event_date, event_location) values ('${B}','${PP}','Anniversaire',current_date+1,'Lieu')`);
    });
    await db.exec(`delete from service_requests where client_id='${B}'`);
  });
  it('un utilisateur ne peut pas modifier le statut d’une demande directement (pas de politique UPDATE)', async () => {
    for (const u of [A, P, B]) {
      await as(u, async () => {
        const r = await db.query(`update service_requests set status='confirmed' where id='${REQ}' returning id`);
        expect(r.rows).toHaveLength(0);
      });
    }
    expect((await q(`select status from service_requests where id='${REQ}'`))[0]!.status).toBe('sent');
  });
  it('anti-escalade : impossible de se promouvoir admin ou de se réactiver', async () => {
    await as(A, async () => {
      await expect(db.exec(`update profiles set role='admin' where id='${A}'`)).rejects.toThrow(/row-level security/);
      await expect(db.exec(`update profiles set status='suspended' where id='${A}'`)).rejects.toThrow(/row-level security/);
      await db.exec(`update profiles set display_name='Alice' where id='${A}'`); // champs autorisés
    });
    expect((await q(`select role, display_name from profiles where id='${A}'`))[0]).toEqual({ role: 'client', display_name: 'Alice' });
  });
  it('un prestataire ne peut pas se valider lui-même ni toucher le profil d’un autre', async () => {
    await as(P2, async () => {
      await expect(db.exec(`update provider_profiles set status='approved' where profile_id='${P2}'`)).rejects.toThrow(/row-level security/);
      const r = await db.query(`update provider_profiles set business_name='Piraté' where id='${PP}' returning id`);
      expect(r.rows).toHaveLength(0);
    });
    await as(ADM, async () => {
      await db.exec(`update provider_profiles set status='approved' where id='${PP2}'`);
    });
    await db.exec(`update provider_profiles set status='pending' where id='${PP2}'`);
  });
  it('une photo ajoutée est toujours « en attente » ; un prestataire ne publie pas chez un autre', async () => {
    await as(P, async () => {
      await expect(db.exec(`insert into portfolio_items (provider_id, title, image_path, moderation_status) values ('${PP}','Triche','c.webp','approved')`)).rejects.toThrow(/row-level security/);
      await expect(db.exec(`insert into portfolio_items (provider_id, title, image_path) values ('${PP2}','Chez autrui','d.webp')`)).rejects.toThrow(/row-level security/);
      await db.exec(`insert into portfolio_items (provider_id, title, image_path) values ('${PP}','Ok','e.webp')`);
    });
  });
  it('messages : seuls les participants écrivent, sous leur propre identité', async () => {
    await as(B, async () => {
      await expect(db.exec(`insert into request_messages (request_id, sender_id, body) values ('${REQ}','${B}','intrus')`)).rejects.toThrow(/row-level security/);
    });
    await as(A, async () => {
      await expect(db.exec(`insert into request_messages (request_id, sender_id, body) values ('${REQ}','${P}','usurpation')`)).rejects.toThrow(/row-level security/);
      await db.exec(`insert into request_messages (request_id, sender_id, body) values ('${REQ}','${A}','Merci')`);
    });
    await as(P, async () => {
      await db.exec(`insert into request_messages (request_id, sender_id, body) values ('${REQ}','${P}','Avec plaisir')`);
    });
  });
  it('notifications : on ne lit ni ne modifie celles des autres ; admin_logs et catégories réservés aux admins', async () => {
    await as(A, async () => {
      const r = await db.query(`update notifications set read_at=now() where user_id='${B}' returning id`);
      expect(r.rows).toHaveLength(0);
      await expect(db.exec(`insert into notifications (user_id, type, title) values ('${A}','system','forgée')`)).rejects.toThrow(/row-level security/);
      await expect(db.exec(`insert into admin_logs (admin_id, action) values ('${A}','x')`)).rejects.toThrow(/row-level security/);
      await expect(db.exec(`insert into service_categories (slug, name) values ('x','X')`)).rejects.toThrow(/row-level security/);
    });
    await as(ADM, async () => {
      await db.exec(`insert into service_categories (slug, name) values ('test-admin','Test admin')`);
    });
  });
  it('signalements : création à son nom, traitement par admin uniquement', async () => {
    await as(B, async () => {
      await expect(db.exec(`insert into reports (reporter_id, target_type, target_id, reason) values ('${A}','provider','${PP}','usurpé')`)).rejects.toThrow(/row-level security/);
      await db.exec(`insert into reports (reporter_id, target_type, target_id, reason) values ('${B}','provider','${PP}','Photos trompeuses')`);
      const r = await db.query(`update reports set status='dismissed' where reporter_id='${B}' returning id`);
      expect(r.rows).toHaveLength(0);
    });
    await as(ADM, async () => {
      expect((await db.query(`update reports set status='reviewed' returning id`)).rows.length).toBeGreaterThan(0);
    });
  });
});

describe('boutique — SQL', () => {
  it('produits de départ chargés, tous rattachés à une catégorie, prix positifs', async () => {
    expect((await q('select count(*)::int n from products'))[0]!.n).toBe(28);
    expect((await q('select count(*)::int n from products where category_id is null or price_pi <= 0'))[0]!.n).toBe(0);
  });
  it('anonyme : voit les produits actifs, jamais les commandes', async () => {
    await as(null, async () => {
      expect((await q('select count(*)::int n from products'))[0]!.n).toBe(28);
      expect((await q('select count(*)::int n from orders'))[0]!.n).toBe(0);
    });
  });
  it('un utilisateur ne peut ni créer un produit ni une commande directement (serveur uniquement)', async () => {
    await as(A, async () => {
      await expect(db.exec(`insert into products (title, price_pi) values ('Pirate', 0.01)`)).rejects.toThrow();
      await expect(db.exec(`insert into orders (client_id, product_title, quantity, unit_price_pi, total_pi, recipient_name, phone, country, city, address) values ('${A}','x',1,1,1,'Nom X','123456','BJ','Cotonou','Adresse 1')`)).rejects.toThrow();
    });
  });
  it('contraintes : quantité et montant', async () => {
    await expect(db.exec(`insert into orders (client_id, product_title, quantity, unit_price_pi, total_pi, recipient_name, phone, country, city, address) values ('${A}','x',0,1,1,'Nom X','123456','BJ','Cotonou','Adresse 1')`)).rejects.toThrow();
    await expect(db.exec(`insert into products (title, price_pi) values ('Gratuit', 0)`)).rejects.toThrow();
  });
});
