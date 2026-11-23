import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PROVIDER_2_ID, DEMO_PROVIDER_ID, futureDate, loginDemo, loginPi, makeApp, validRequest, type Harness } from './helpers.js';

let h: Harness;
beforeEach(async () => {
  h = await makeApp();
});

const png = () => sharp({ create: { width: 40, height: 40, channels: 3, background: '#c7a66a' } }).png().toBuffer();

describe('catalogue public', () => {
  it('l’accueil expose catégories, réalisations et prestataires sans aucun champ financier', async () => {
    const res = await h.http.get('/api/home').expect(200);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(10);
    expect(res.body.featured.length).toBeGreaterThan(0);
    expect(res.body.providers.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/budget|prix|tarif|price|amount|montant/i);
  });
  it('filtre par catégorie, zone et recherche (accents ignorés)', async () => {
    const byCat = await h.http.get('/api/providers?category=evenements-corporatifs').expect(200);
    expect(byCat.body.providers.map((p: { id: string }) => p.id)).toEqual([DEMO_PROVIDER_2_ID]);
    const byZone = await h.http.get('/api/providers?zone=sème-podji').expect(200);
    expect(byZone.body.providers.length).toBe(1);
    const byQ = await h.http.get('/api/providers?q=evenement').expect(200);
    expect(byQ.body.providers.length).toBeGreaterThan(0);
  });
  it('un identifiant mal formé donne 404, pas une erreur serveur', async () => {
    await h.http.get('/api/providers/pas-un-uuid').expect(404);
  });
  it('les demandes ne sont pas accessibles sans connexion', async () => {
    await h.http.get('/api/requests').expect(401);
    await h.http.get('/api/me').expect(401);
  });
});

describe('connexion Pi', () => {
  it('crée un profil client à la première connexion et le retrouve ensuite', async () => {
    const a = await loginPi(h, 'alice');
    const b = await loginPi(h, 'alice');
    expect(a.profile.id).toBe(b.profile.id);
    const me = await h.http.get('/api/me').set(a.auth).expect(200);
    expect(me.body.profile).toMatchObject({ pi_username: 'alice', role: 'client' });
    expect(JSON.stringify(me.body)).not.toContain('pi-uid-alice'); // pi_uid jamais exposé
  });
  it('refuse un jeton refusé par Pi, et ne fait pas confiance à un username envoyé par le navigateur', async () => {
    await h.http.post('/api/auth/pi').send({ accessToken: 'bad-xxxxxxxxxxxx' }).expect(401);
    await h.http.post('/api/auth/pi').send({ accessToken: 'tok-mallory-0123456789', username: 'boss', uid: 'x' }).expect(400);
  });
  it('un jeton de session forgé est refusé', async () => {
    await h.http.get('/api/me').set({ Authorization: 'Bearer abc.def.ghi' }).expect(401);
  });
  it('promeut automatiquement les comptes listés dans ADMIN_PI_USERNAMES', async () => {
    const boss = await loginPi(h, 'boss');
    const me = await h.http.get('/api/me').set(boss.auth).expect(200);
    expect(me.body.profile.role).toBe('admin');
    await h.http.get('/api/admin/stats').set(boss.auth).expect(200);
  });
  it('la connexion de démonstration est absente quand elle est désactivée', async () => {
    const prod = await makeApp({ DEMO_MODE: 'false' });
    await prod.http.post('/api/auth/demo').send({ role: 'admin' }).expect(404);
  });
});

describe('demandes de prestation', () => {
  it('un client crée une demande ; le prestataire est notifié', async () => {
    const client = await loginPi(h, 'alice');
    const created = await h.http.post('/api/requests').set(client.auth).send(validRequest()).expect(201);
    expect(created.body.status).toBe('sent');

    const provider = await loginDemo(h, 'provider');
    const list = await h.http.get('/api/requests?as=provider').set(provider.auth).expect(200);
    expect(list.body.requests).toHaveLength(1);
    expect(list.body.requests[0].client.name).toBe('alice');
    const notifs = await h.http.get('/api/notifications').set(provider.auth).expect(200);
    expect(notifs.body.notifications[0]).toMatchObject({ type: 'request_new', request_id: created.body.id });
  });

  it('REFUSE tout champ de budget, tarif ou estimation', async () => {
    const client = await loginPi(h, 'alice');
    for (const k of ['budget', 'budget_max', 'price', 'prix_indicatif', 'tarif', 'estimation', 'amount']) {
      const res = await h.http.post('/api/requests').set(client.auth).send(validRequest({ [k]: 500 })).expect(400);
      expect(res.body.error.code).toBe('invalid_field');
    }
    expect(await h.store.count('service_requests')).toBe(0);
  });

  it('refuse une date passée, un prestataire inconnu et l’auto-demande', async () => {
    const client = await loginPi(h, 'alice');
    await h.http.post('/api/requests').set(client.auth).send(validRequest({ event_date: '2020-01-01' })).expect(400);
    await h.http.post('/api/requests').set(client.auth).send(validRequest({ provider_id: '11111111-1111-4111-8111-111111111111' })).expect(404);
    const prov = await loginDemo(h, 'provider');
    await h.http.post('/api/requests').set(prov.auth).send(validRequest()).expect(400);
  });

  it('limite à 3 demandes ouvertes par prestataire', async () => {
    const client = await loginPi(h, 'alice');
    for (let i = 0; i < 3; i++) await h.http.post('/api/requests').set(client.auth).send(validRequest()).expect(201);
    await h.http.post('/api/requests').set(client.auth).send(validRequest()).expect(409);
  });

  it('PRIVÉ : un autre client, un autre prestataire et un anonyme ne voient pas la demande', async () => {
    const alice = await loginPi(h, 'alice');
    const { body } = await h.http.post('/api/requests').set(alice.auth).send(validRequest()).expect(201);
    const bob = await loginPi(h, 'bob');
    await h.http.get(`/api/requests/${body.id}`).set(bob.auth).expect(404);
    await h.http.post(`/api/requests/${body.id}/messages`).set(bob.auth).send({ body: 'coucou' }).expect(404);
    await h.http.post(`/api/requests/${body.id}/status`).set(bob.auth).send({ status: 'closed' }).expect(404);
    const list = await h.http.get('/api/requests').set(bob.auth).expect(200);
    expect(list.body.requests).toEqual([]);
    await h.http.get(`/api/requests/${body.id}`).expect(401);

    // Un second prestataire (candidature approuvée) ne voit pas la demande adressée au premier.
    const other = await loginPi(h, 'carol');
    await h.http.post('/api/me/provider').set(other.auth).send({ business_name: 'Carol Déco' }).expect(201);
    await h.http.get(`/api/requests/${body.id}`).set(other.auth).expect(404);
  });

  it('parcours complet : examen → précisions → réponse du client → confirmation → clôture', async () => {
    const alice = await loginPi(h, 'alice');
    const prov = await loginDemo(h, 'provider');
    const { body } = await h.http.post('/api/requests').set(alice.auth).send(validRequest()).expect(201);
    const id = body.id as string;
    const st = (who: { auth: Record<string, string> }, status: string, note?: string) =>
      h.http.post(`/api/requests/${id}/status`).set(who.auth).send({ status, note });

    await st(prov, 'in_review').expect(200);
    await st(prov, 'info_requested').expect(400); // note obligatoire
    await st(prov, 'info_requested', 'Quelle est la surface de la salle ?').expect(200);

    // Le client répond par message : passage automatique à « Réponse reçue ».
    await h.http.post(`/api/requests/${id}/messages`).set(alice.auth).send({ body: 'Environ 200 m².' }).expect(201);
    const detail = await h.http.get(`/api/requests/${id}`).set(alice.auth).expect(200);
    expect(detail.body.request.status).toBe('response_received');
    expect(detail.body.messages).toHaveLength(1);
    expect(detail.body.messages[0].mine).toBe(true);

    await st(prov, 'confirmed').expect(200);
    await st(prov, 'closed').expect(200);
    await h.http.post(`/api/requests/${id}/messages`).set(alice.auth).send({ body: 'Merci' }).expect(409);
    await st(prov, 'in_review').expect(409);
  });

  it('un client ne peut pas confirmer ni refuser sa propre demande, mais peut l’annuler', async () => {
    const alice = await loginPi(h, 'alice');
    const { body } = await h.http.post('/api/requests').set(alice.auth).send(validRequest()).expect(201);
    const post = (status: string) => h.http.post(`/api/requests/${body.id}/status`).set(alice.auth).send({ status });
    await post('confirmed').expect(409);
    await post('declined').expect(409);
    await post('in_review').expect(409);
    await post('closed').expect(200);
  });

  it('les photos d’inspiration doivent appartenir à l’utilisateur', async () => {
    const alice = await loginPi(h, 'alice');
    const bob = await loginPi(h, 'bob');
    const up = await h.http.post('/api/uploads/inspiration').set(bob.auth).attach('file', await png(), 'x.png').expect(201);
    // Alice tente de réutiliser le fichier de Bob
    await h.http.post('/api/requests').set(alice.auth).send(validRequest({ inspiration_paths: [up.body.path] })).expect(400);
    await h.http.post('/api/requests').set(alice.auth).send(validRequest({ inspiration_paths: ['../../etc/passwd'] })).expect(400);
    // Bob peut utiliser le sien
    const ok = await h.http.post('/api/requests').set(bob.auth).send(validRequest({ inspiration_paths: [up.body.path] })).expect(201);
    const detail = await h.http.get(`/api/requests/${ok.body.id}`).set(bob.auth).expect(200);
    expect(detail.body.request.inspiration_urls).toHaveLength(1);
  });

  it('un administrateur peut consulter une demande, ce qui est journalisé', async () => {
    const alice = await loginPi(h, 'alice');
    const { body } = await h.http.post('/api/requests').set(alice.auth).send(validRequest()).expect(201);
    const admin = await loginDemo(h, 'admin');
    await h.http.get(`/api/requests/${body.id}`).set(admin.auth).expect(200);
    await h.http.post(`/api/requests/${body.id}/messages`).set(admin.auth).send({ body: 'x' }).expect(403);
    const logs = await h.http.get('/api/admin/logs').set(admin.auth).expect(200);
    expect(logs.body.logs.some((l: { action: string }) => l.action === 'request.view')).toBe(true);
  });
});

describe('téléversement de fichiers', () => {
  it('refuse un faux PNG (contenu texte), un PDF et un fichier trop lourd', async () => {
    const c = await loginPi(h, 'alice');
    await h.http.post('/api/uploads/inspiration').set(c.auth).attach('file', Buffer.from('<script>alert(1)</script>'), 'photo.png').expect(400);
    await h.http.post('/api/uploads/inspiration').set(c.auth).attach('file', Buffer.from('%PDF-1.4 ...'), 'doc.pdf').expect(400);
    await h.http.post('/api/uploads/inspiration').set(c.auth).attach('file', Buffer.alloc(6 * 1024 * 1024, 1), 'big.png').expect(400);
    await h.http.post('/api/uploads/inspiration').set(c.auth).expect(400);
  });
  it('accepte une vraie image, la convertit en WebP et exige l’authentification', async () => {
    const c = await loginPi(h, 'alice');
    const res = await h.http.post('/api/uploads/inspiration').set(c.auth).attach('file', await png(), 'ok.png').expect(201);
    expect(res.body.path).toMatch(new RegExp(`^${c.profile.id}/[0-9a-f-]{36}\\.webp$`));
    await h.http.post('/api/uploads/inspiration').attach('file', await png(), 'ok.png').expect(401);
  });
});

describe('espace prestataire', () => {
  it('réservé au rôle prestataire', async () => {
    const client = await loginPi(h, 'alice');
    await h.http.get('/api/provider/me').set(client.auth).expect(403);
    await h.http.post('/api/provider/services').set(client.auth).send({}).expect(403);
  });

  it('candidature → invisible → validation admin → visible publiquement', async () => {
    const carol = await loginPi(h, 'carol');
    await h.http
      .post('/api/me/provider')
      .set(carol.auth)
      .send({ business_name: 'Carol Déco', specialties: ['Mariages'], service_zones: ['Cotonou'], city: 'Cotonou' })
      .expect(201);
    await h.http.post('/api/me/provider').set(carol.auth).send({ business_name: 'Encore' }).expect(409);
    const mine = await h.http.get('/api/provider/me').set(carol.auth).expect(200);
    const pid = mine.body.provider.id as string;

    // Non visible tant que non validé
    await h.http.get(`/api/providers/${pid}`).expect(404);
    expect((await h.http.get('/api/providers?q=carol')).body.providers).toHaveLength(0);
    await h.http.post('/api/requests').set((await loginPi(h, 'alice')).auth).send(validRequest({ provider_id: pid })).expect(404);

    // Un prestataire ne peut pas se valider lui-même
    await h.http.post(`/api/admin/providers/${pid}/status`).set(carol.auth).send({ status: 'approved' }).expect(403);

    const admin = await loginDemo(h, 'admin');
    await h.http.post(`/api/admin/providers/${pid}/status`).set(admin.auth).send({ status: 'approved' }).expect(200);
    expect((await h.http.get(`/api/providers/${pid}`).expect(200)).body.provider.business_name).toBe('Carol Déco');
    expect((await h.http.get('/api/providers?q=carol')).body.providers).toHaveLength(1);
    const notifs = await h.http.get('/api/notifications').set(carol.auth).expect(200);
    expect(notifs.body.notifications.some((n: { title: string }) => n.title.includes('validé'))).toBe(true);
  });

  it('un prestataire ne peut modifier que ses propres services', async () => {
    const dana = await loginPi(h, 'dana');
    await h.http.post('/api/me/provider').set(dana.auth).send({ business_name: 'Dana Events' }).expect(201);
    const cats = (await h.http.get('/api/categories')).body.categories;
    const created = await h.http.post('/api/provider/services').set(dana.auth).send({ category_id: cats[0].id, title: 'Mon service' }).expect(201);

    const demoProv = await loginDemo(h, 'provider');
    const demoServices = (await h.http.get('/api/provider/me').set(demoProv.auth)).body.services;
    await h.http.put(`/api/provider/services/${demoServices[0].id}`).set(dana.auth).send({ category_id: cats[0].id, title: 'Piraté' }).expect(404);
    await h.http.delete(`/api/provider/services/${demoServices[0].id}`).set(dana.auth).expect(404);
    await h.http.put(`/api/provider/services/${created.body.service.id}`).set(dana.auth).send({ category_id: cats[0].id, title: 'Modifié' }).expect(200);
    // Aucun champ de tarif acceptable sur un service
    await h.http.post('/api/provider/services').set(dana.auth).send({ category_id: cats[0].id, title: 'X', price: 10 }).expect(400);
  });

  it('une photo envoyée est « en attente » : invisible au public jusqu’à modération', async () => {
    const prov = await loginDemo(h, 'provider');
    const up = await h.http
      .post('/api/provider/portfolio')
      .set(prov.auth)
      .field('title', 'Nouvelle réalisation')
      .attach('file', await png(), 'r.png')
      .expect(201);
    expect(up.body.item.moderation_status).toBe('pending');

    const publicBefore = await h.http.get(`/api/providers/${DEMO_PROVIDER_ID}`).expect(200);
    expect(publicBefore.body.portfolio.some((i: { title: string }) => i.title === 'Nouvelle réalisation')).toBe(false);

    const admin = await loginDemo(h, 'admin');
    const pending = await h.http.get('/api/admin/portfolio?status=pending').set(admin.auth).expect(200);
    expect(pending.body.items).toHaveLength(1);
    await h.http.post(`/api/admin/portfolio/${up.body.item.id}/moderate`).set(admin.auth).send({ status: 'approved' }).expect(200);

    const publicAfter = await h.http.get(`/api/providers/${DEMO_PROVIDER_ID}`).expect(200);
    expect(publicAfter.body.portfolio.some((i: { title: string }) => i.title === 'Nouvelle réalisation')).toBe(true);
  });

  it('refuse une photo sans titre ou au mauvais format', async () => {
    const prov = await loginDemo(h, 'provider');
    await h.http.post('/api/provider/portfolio').set(prov.auth).attach('file', await png(), 'r.png').expect(400);
    await h.http.post('/api/provider/portfolio').set(prov.auth).field('title', 'Faux').attach('file', Buffer.from('GIF89a'), 'r.gif').expect(400);
  });
});

describe('administration', () => {
  it('toutes les routes admin sont interdites aux clients et prestataires', async () => {
    const client = await loginPi(h, 'alice');
    const prov = await loginDemo(h, 'provider');
    for (const who of [client, prov]) {
      for (const path of ['/stats', '/users', '/providers', '/categories', '/portfolio', '/requests', '/reports', '/logs']) {
        await h.http.get(`/api/admin${path}`).set(who.auth).expect(403);
      }
    }
    await h.http.get('/api/admin/stats').expect(401);
  });

  it('la suspension d’un compte coupe l’accès immédiatement et retire le prestataire du catalogue', async () => {
    const admin = await loginDemo(h, 'admin');
    const prov = await loginDemo(h, 'provider');
    await h.http.get('/api/provider/me').set(prov.auth).expect(200);
    await h.http.post(`/api/admin/users/${prov.profile.id}/status`).set(admin.auth).send({ status: 'suspended', note: 'Contenu inapproprié' }).expect(200);
    const res = await h.http.get('/api/provider/me').set(prov.auth).expect(403);
    expect(res.body.error.message).toMatch(/suspendu/);
    expect((await h.http.get('/api/providers')).body.providers.map((p: { id: string }) => p.id)).not.toContain(DEMO_PROVIDER_ID);
    // Une nouvelle connexion est refusée
    await h.http.post('/api/auth/demo').send({ role: 'provider' }).expect(200); // la démo ne passe pas par Pi…
    const me = await h.http.get('/api/me').set(prov.auth).expect(403);
    expect(me.body.error.code).toBe('forbidden');
  });

  it('un compte suspendu ne peut plus se reconnecter via Pi', async () => {
    const eve = await loginPi(h, 'eve');
    const admin = await loginDemo(h, 'admin');
    await h.http.post(`/api/admin/users/${eve.profile.id}/status`).set(admin.auth).send({ status: 'suspended' }).expect(200);
    await h.http.post('/api/auth/pi').send({ accessToken: 'tok-eve-0123456789' }).expect(403);
  });

  it('un admin ne peut pas se suspendre ni suspendre un autre admin', async () => {
    const admin = await loginDemo(h, 'admin');
    await h.http.post(`/api/admin/users/${admin.profile.id}/status`).set(admin.auth).send({ status: 'suspended' }).expect(400);
    const boss = await loginPi(h, 'boss');
    await h.http.post(`/api/admin/users/${boss.profile.id}/status`).set(admin.auth).send({ status: 'suspended' }).expect(400);
  });

  it('gère les catégories : création, doublon, désactivation, suppression bloquée si utilisée', async () => {
    const admin = await loginDemo(h, 'admin');
    const c = await h.http.post('/api/admin/categories').set(admin.auth).send({ name: 'Fleurs', slug: 'fleurs', sort_order: 5 }).expect(201);
    await h.http.post('/api/admin/categories').set(admin.auth).send({ name: 'Fleurs 2', slug: 'fleurs' }).expect(409);
    await h.http.post('/api/admin/categories').set(admin.auth).send({ name: 'X', slug: 'Mauvais Slug' }).expect(400);
    await h.http.put(`/api/admin/categories/${c.body.category.id}`).set(admin.auth).send({ name: 'Fleurs', slug: 'fleurs', is_active: false }).expect(200);
    expect((await h.http.get('/api/categories')).body.categories.some((x: { slug: string }) => x.slug === 'fleurs')).toBe(false);
    await h.http.delete(`/api/admin/categories/${c.body.category.id}`).set(admin.auth).expect(204);
    const used = (await h.http.get('/api/categories')).body.categories[0];
    await h.http.delete(`/api/admin/categories/${used.id}`).set(admin.auth).expect(409);
  });

  it('signalements : création, doublon refusé, traitement et journal', async () => {
    const alice = await loginPi(h, 'alice');
    const rep = await h.http.post('/api/reports').set(alice.auth).send({ target_type: 'provider', target_id: DEMO_PROVIDER_ID, reason: 'Photos trompeuses' }).expect(201);
    await h.http.post('/api/reports').set(alice.auth).send({ target_type: 'provider', target_id: DEMO_PROVIDER_ID, reason: 'Encore' }).expect(409);
    await h.http.post('/api/reports').set(alice.auth).send({ target_type: 'provider', target_id: '11111111-1111-4111-8111-111111111111', reason: 'Inconnu' }).expect(404);
    await h.http.get('/api/admin/reports').set(alice.auth).expect(403);

    const admin = await loginDemo(h, 'admin');
    const list = await h.http.get('/api/admin/reports?status=open').set(admin.auth).expect(200);
    expect(list.body.reports).toHaveLength(1);
    await h.http.post(`/api/admin/reports/${rep.body.id}/resolve`).set(admin.auth).send({ status: 'dismissed' }).expect(200);
    const logs = (await h.http.get('/api/admin/logs').set(admin.auth)).body.logs;
    expect(logs[0].action).toBe('report.dismissed');
  });

  it('les statistiques reflètent l’activité', async () => {
    const alice = await loginPi(h, 'alice');
    await h.http.post('/api/requests').set(alice.auth).send(validRequest({ event_date: futureDate(5) })).expect(201);
    const admin = await loginDemo(h, 'admin');
    const s = (await h.http.get('/api/admin/stats').set(admin.auth).expect(200)).body;
    expect(s.requests.total).toBe(1);
    expect(s.requests.by_status.sent).toBe(1);
    expect(s.requests_last_14_days).toHaveLength(14);
  });
});

describe('favoris et notifications', () => {
  it('ajout idempotent, liste, suppression ; impossible de supprimer le favori d’autrui', async () => {
    const alice = await loginPi(h, 'alice');
    const bob = await loginPi(h, 'bob');
    const f1 = await h.http.post('/api/favorites').set(alice.auth).send({ provider_id: DEMO_PROVIDER_ID }).expect(201);
    const f2 = await h.http.post('/api/favorites').set(alice.auth).send({ provider_id: DEMO_PROVIDER_ID }).expect(200);
    expect(f2.body.favorite_id).toBe(f1.body.favorite_id);
    await h.http.post('/api/favorites').set(alice.auth).send({}).expect(400);
    await h.http.post('/api/favorites').set(alice.auth).send({ provider_id: DEMO_PROVIDER_ID, portfolio_item_id: DEMO_PROVIDER_2_ID }).expect(400);

    expect((await h.http.get('/api/favorites').set(alice.auth)).body.providers).toHaveLength(1);
    expect((await h.http.get('/api/favorites').set(bob.auth)).body.providers).toHaveLength(0);
    await h.http.delete(`/api/favorites/${f1.body.favorite_id}`).set(bob.auth).expect(404);
    await h.http.delete(`/api/favorites/${f1.body.favorite_id}`).set(alice.auth).expect(204);
  });

  it('les notifications sont personnelles et peuvent être marquées comme lues', async () => {
    const alice = await loginPi(h, 'alice');
    await h.http.post('/api/requests').set(alice.auth).send(validRequest()).expect(201);
    const prov = await loginDemo(h, 'provider');
    const n = (await h.http.get('/api/notifications').set(prov.auth)).body;
    expect(n.unread).toBe(1);
    expect((await h.http.get('/api/notifications').set(alice.auth)).body.notifications).toHaveLength(0);

    // Alice ne peut pas marquer comme lue la notification du prestataire
    await h.http.post('/api/notifications/read').set(alice.auth).send({ ids: [n.notifications[0].id] }).expect(200);
    expect((await h.http.get('/api/notifications').set(prov.auth)).body.unread).toBe(1);
    await h.http.post('/api/notifications/read').set(prov.auth).send({}).expect(200);
    expect((await h.http.get('/api/notifications').set(prov.auth)).body.unread).toBe(0);
  });
});

describe('robustesse', () => {
  it('ne divulgue ni trace ni secret en cas d’erreur', async () => {
    const res = await h.http.post('/api/auth/pi').set('content-type', 'application/json').send('{"accessToken":').expect(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.(ts|js)|node_modules|SESSION_SECRET/);
    await h.http.post('/api/requests').set((await loginPi(h, 'a1')).auth).send({ x: 'y'.repeat(60_000) }).expect(413);
  });
  it('envoie les en-têtes de sécurité (CSP autorisant uniquement le SDK Pi)', async () => {
    const res = await h.http.get('/api/health').expect(200);
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain('https://sdk.minepi.com');
    expect(csp).toContain("object-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('sert la clé de validation de domaine Pi quand elle est configurée', async () => {
    const x = await makeApp({ PI_VALIDATION_KEY: 'cle-de-validation-123' });
    const res = await x.http.get('/validation-key.txt').expect(200);
    expect(res.text).toBe('cle-de-validation-123');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });
});
