# EMADECO — Décoration & Événements

Application web mobile de **mise en relation** entre clients et prestataires de décoration événementielle, conçue pour fonctionner dans **Pi Browser** (écosystème Pi Network).

- **Clients** : découvrir les services et réalisations, consulter les profils, envoyer une demande de prestation, suivre les réponses, échanger, enregistrer des favoris.
- **Prestataires** : profil, spécialités, zones, services, portfolio photo, réception et traitement des demandes.
- **Administrateur** : validation des prestataires, modération des photos, utilisateurs, catégories, demandes, signalements, statistiques, journal des actions.

> **Aucun budget, tarif, prix, fourchette, devis ou estimation n'existe dans l'application** (ni champ, ni colonne SQL, ni filtre). Le serveur refuse tout champ inconnu dans une demande, et `npm run check:budget` fait échouer la CI si ce vocabulaire apparaît dans le code.
> **Paiements Pi : uniquement dans la boutique** (prix de test, Testnet). Les demandes, prestataires et l'exploration restent sans paiement ; le cœur du produit est la mise en relation (voir §9). Les paiements sont décidés et vérifiés côté serveur (`PI_API_KEY` obligatoire pour la boutique).

---

## 1. Architecture

```
emadeco/
├─ web/        React 18 + TypeScript + Vite (mobile-first, thème vert / or / ivoire / beige rosé)
├─ server/     Node 22 + Express + TypeScript (API, sécurité, vérification Pi)
├─ supabase/   migrations SQL (schéma, RLS, stockage, catégories) + seed de démonstration
├─ scripts/    garde-fou « aucun budget »
└─ render.yaml blueprint d'hébergement (un seul service : API + frontend compilé)
```

| Brique | Rôle |
|---|---|
| Frontend | Interface mobile, 5 onglets (Accueil, Explorer, Demandes, Favoris, Profil), espaces prestataire et admin chargés à la demande |
| Backend Express | Vérification des jetons Pi, rôles, machine à états des demandes, validation, limitation de débit, envoi d'images |
| Supabase | PostgreSQL (11 tables + RLS) et stockage des images (`portfolio` public, `inspiration` privé) |
| SDK Pi | `https://sdk.minepi.com/pi-sdk.js`, `Pi.init({ version: '2.0' })`, `Pi.authenticate(['username'], …)` |
| API Pi | Le serveur vérifie l'`accessToken` via `GET https://api.minepi.com/v2/me` (`Authorization: Bearer …`) |

**Choix d'architecture** : toute la logique métier et les contrôles d'accès sont au-dessus d'une petite interface `Store`. Deux implémentations : Supabase (production) et mémoire (démonstration locale et tests). Le serveur utilise la clé `service_role` (qui contourne la RLS) ; les politiques RLS protègent donc tout accès direct fait avec la clé `anon` ou un JWT utilisateur (défense en profondeur, testée sur un vrai PostgreSQL).

### Parcours de connexion Pi
1. `Pi.authenticate` (dans Pi Browser) renvoie un `accessToken`.
2. Le navigateur envoie **uniquement** ce jeton à `POST /api/auth/pi` (tout autre champ est refusé).
3. Le serveur appelle l'API Pi, obtient `uid` + `username` (jamais crus depuis le navigateur), crée ou retrouve le profil, puis émet sa propre session signée (JWT HS256, 7 jours, ne contenant que l'identifiant).
4. **Rôle et statut du compte sont relus en base à chaque requête** : une suspension prend effet immédiatement.

### Statuts d'une demande
`envoyée → en cours d'examen → informations demandées → réponse reçue → confirmée / refusée → clôturée`

| Acteur | Transitions autorisées |
|---|---|
| Prestataire | envoyée→examen / infos / refusée · examen→infos / confirmée / refusée · réponse reçue→examen / infos / confirmée / refusée · confirmée ou refusée→clôturée |
| Client | annuler (→ clôturée) à tout moment · répondre à une demande d'informations (→ réponse reçue, automatique à l'envoi d'un message) |
| Admin | toute transition valide du schéma |

Les mêmes règles sont répétées dans la base (trigger `enforce_request_transition`).

---

## 2. Démarrage en local (mode démonstration, sans Supabase ni Pi)

Prérequis : **Node.js ≥ 22**.

```bash
npm install
npm run build
npm start                 # http://localhost:3000
```

Sans Supabase configuré, le serveur utilise une **base en mémoire avec des données fictives** et affiche un bandeau « MODE DÉMONSTRATION ». L'écran de connexion propose alors des entrées Client / Prestataire / Admin. Ce mode est **impossible en production** (`NODE_ENV=production` le désactive).

Développement avec rechargement : `cp .env.example .env` puis `npm run dev` (API sur :3000, frontend sur :5173 avec proxy `/api`).

> La connexion Pi, elle, ne fonctionne **que dans Pi Browser** : le SDK Pi n'existe pas dans un navigateur ordinaire.

---

## 3. Configuration Supabase (production / Testnet réel)

1. Créez un projet sur <https://supabase.com> (région proche de vos utilisateurs).
2. **SQL Editor** : exécutez dans l'ordre, un fichier à la fois, le contenu de :
   1. `supabase/migrations/0001_schema.sql` — tables, contraintes, index, trigger de statuts
   2. `supabase/migrations/0002_rls.sql` — fonctions d'aide et politiques RLS
   3. `supabase/migrations/0003_storage.sql` — buckets `portfolio` (public) et `inspiration` (privé), 5 Mo, JPEG/PNG/WebP
   4. `supabase/migrations/0004_categories.sql` — 10 catégories de services
   *(ou, avec la CLI Supabase : `supabase link` puis `supabase db push`)*
3. **Optionnel, Testnet uniquement** : `supabase/seed.sql` charge 4 prestataires **fictifs** (suffixe « (démo) »). Ne pas l'exécuter en production réelle.
4. **Settings → API** : copiez l'**URL du projet** et la clé **`service_role`** dans les variables d'environnement de l'hébergeur (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). La clé `service_role` ne doit **jamais** aller dans le frontend, Git ou un chat.
5. Vérifiez dans **Table Editor** que les 11 tables affichent « RLS enabled ».

## 4. Configuration Pi Developer Portal

> Vérifiez chaque étape sur la documentation officielle au moment de la mise en œuvre : <https://developers.minepi.com/docs/docs/build-first-app/GettingStarted>

1. Ouvrez le Pi Developer Portal (depuis Pi Browser, menu *Develop*) et **enregistrez l'application**.
2. **URL de l'application** : l'URL HTTPS de votre hébergement (ex. `https://emadeco.onrender.com`). Une adresse `*.pinet.com` appartient à Pi et ne permet pas de déposer le fichier de vérification : utilisez votre propre domaine.
3. **Vérification du domaine** : le portail affiche une clé. Copiez-la dans la variable `PI_VALIDATION_KEY` de l'hébergeur ; elle est servie sur `https://<votre-domaine>/validation-key.txt`. Cliquez ensuite sur « Verify » dans le portail.
4. **Testnet d'abord** : `PI_NETWORK=testnet`. Testez la connexion depuis Pi Browser sur Testnet.
5. Si vous utilisez le bac à sable Pi, mettez `PI_SANDBOX=true` (transmis à `Pi.init({ sandbox: true })`).
6. **Mainnet** : créez/obtenez une configuration **distincte** (URL vérifiée, `PI_NETWORK=mainnet`), puis suivez la liste de contrôle Mainnet de Pi (§8). Ne publiez pas avant cette vérification.

Scopes demandés : `username` à la connexion (aucune adresse de portefeuille). Le droit `payments` n'est demandé qu'au moment de payer une commande de la boutique.

## Dépannage connexion Pi

**Symptôme** : dans Pi Browser, la connexion échoue avec « Pi : Authentication failed » *avant* tout appel au serveur.

**Cause observée** (sur une autre application du même propriétaire) : les en-têtes de sécurité de `helmet` (CSP, COOP, CORP) empêchaient le SDK Pi de finaliser l'authentification ; la connexion n'a fonctionné qu'après leur désactivation.

**Interrupteur** : variable d'environnement `STRICT_HEADERS`.

| Valeur | Effet |
|---|---|
| absente / autre (défaut) | `helmet` **n'est pas appliqué** ; `x-powered-by` reste désactivé |
| `1` | `helmet` appliqué (CSP limitée au SDK Pi, `frame-ancestors` Pi, etc.) |

Réversible : définissez `STRICT_HEADERS=1` dans Render (l'application redéploie) pour rétablir les en-têtes stricts. Autres causes possibles si l'échec persiste : application non enregistrée ou domaine non vérifié dans le Developer Portal (§4), test fait hors Pi Browser.

## 5. Hébergement (Render)

1. Poussez le dépôt sur GitHub, puis Render → **New → Blueprint** : il lit `render.yaml`.
2. Dans l'onglet **Environment** du service, saisissez les valeurs `sync: false` : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PI_VALIDATION_KEY`, `ADMIN_PI_USERNAMES`. `SESSION_SECRET` est généré automatiquement.
3. Déployez. Contrôle : `https://<service>.onrender.com/api/health` → `{"ok":true,"store":"supabase"}`.
4. Points d'attention : l'instance gratuite **se met en veille** (première requête ≈ 50 s) ; activez *Auto-Deploy* si souhaité ; **ne confirmez jamais un « Rollback »** Render sans relire les variables d'environnement qu'il restaure.

### Premier administrateur
Renseignez `ADMIN_PI_USERNAMES=votre_nom_pi` (plusieurs noms séparés par des virgules) : le compte correspondant est promu administrateur à sa prochaine connexion (consigné dans le journal). Alternative SQL :
```sql
update public.profiles set role = 'admin' where pi_username = 'votre_nom_pi';
```

## 6. Variables d'environnement

Voir `.env.example` (aucune valeur secrète). Aucune variable n'est lue par le frontend.

| Variable | Obligatoire | Description |
|---|---|---|
| `NODE_ENV` | oui (prod) | `production` sur l'hébergeur |
| `PORT` | non | 3000 par défaut |
| `SESSION_SECRET` | prod | ≥ 32 caractères, signe les sessions |
| `SUPABASE_URL` | prod | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | Clé service_role (serveur uniquement) |
| `PI_NETWORK` | non | `testnet` (défaut) ou `mainnet` |
| `PI_API_BASE` | non | `https://api.minepi.com/v2` |
| `PI_SANDBOX` | non | `true` pour le bac à sable Pi |
| `PI_VALIDATION_KEY` | recommandé | Clé de vérification de domaine Pi |
| `PI_API_KEY` | pour la boutique | Clé API serveur Pi (Developer Portal) : approuve et finalise les paiements de la boutique (`lib/piPayments.ts`). Sans elle, le paiement est refusé. Jamais dans Git ni dans les journaux |
| `PI_MAX_PAYMENT` | non | Plafond par commande, en Pi. Si défini et > 0, toute commande dont le total le dépasse est refusée (« Montant maximal autorisé pendant la phase de test : X Pi. ») |
| `STRICT_HEADERS` | non | `1` = applique helmet (CSP/COOP/CORP). Défaut : désactivé (§ Dépannage connexion Pi) |
| `ADMIN_PI_USERNAMES` | recommandé | Administrateurs initiaux |
| `DEMO_MODE` | non | Jamais actif en production |

## 7. Sécurité mise en œuvre

- Secrets uniquement dans l'environnement ; `.env` exclu de Git ; journaux avec **masquage** des jetons, clés et en-têtes d'autorisation.
- Validation côté client **et** serveur (zod, schémas **stricts** : toute clé inconnue est refusée) ; caractères de contrôle supprimés ; React échappe les sorties ; CSP restrictive (scripts : `self` + `sdk.minepi.com`).
- Rôles et statut relus en base à chaque appel ; routes `/api/provider/*` et `/api/admin/*` protégées côté serveur ; une demande, un message ou une photo d'inspiration d'autrui répond « introuvable » (on ne révèle pas leur existence).
- RLS Supabase stricte sur les 11 tables (aucun accès anonyme aux demandes, messages, notifications, favoris, signalements, journaux ; impossible de se promouvoir admin ou de se valider soi-même).
- Images : type réel détecté par le contenu (pas l'extension), ≤ 5 Mo, **décodées et ré-encodées en WebP 1600 px** (métadonnées EXIF/GPS supprimées), noms aléatoires, dossiers par utilisateur ; photos d'inspiration privées (URL signées 10 min) ; photos de portfolio publiques seulement après modération.
- Limitation de débit (global, authentification, actions d'écriture) ; limite de 3 demandes ouvertes par client et par prestataire ; gestion d'erreurs sans trace ni secret côté client.
- Actions d'administration journalisées (y compris la consultation d'une demande privée).

## 8. Tests et vérifications

```bash
npm run typecheck      # TypeScript, serveur + web
npm test               # 78 tests serveur + 6 tests web
npm run check:budget   # aucun vocabulaire financier ni flux de paiement dans le code
npm run build
```

Couverture des tests serveur : vérification du jeton Pi (API Pi simulée : succès, 401, indisponibilité, réponses incomplètes) ; machine à états ; permissions (client / prestataire / admin / anonyme) ; confidentialité des demandes et messages ; refus de tout champ budget ; envois de fichiers (faux PNG, PDF, trop lourd) ; modération ; suspension immédiate ; **migrations SQL et politiques RLS exécutées sur un vrai PostgreSQL (PGlite)** avec des schémas `auth`/`storage` simulés.

Un parcours complet a aussi été joué dans Chrome (viewport 390 px) en mode démonstration : accueil → explorer/filtres → connexion → demande en 3 étapes avec photo → réponse du prestataire → précisions → admin.

`npm audit --omit=dev` : 0 vulnérabilité (dépendances de production). Les alertes restantes de `npm audit` concernent uniquement les outils de test/build (vitest, vite, esbuild) : sans effet sur le code déployé, à traiter lors d'une montée de version majeure.

**Liste de contrôle avant Mainnet** (à confirmer sur la documentation Pi du moment) : authentification Pi obligatoire ✔ implémentée ; aucune redirection vers un service externe ✔ (aucun lien sortant) ; paiements limités à la boutique, vérifiés côté serveur ✔ ; application enregistrée et domaine vérifié ✘ à faire ; test complet dans Pi Browser sur Testnet ✘ à faire ; revue par Pi ✘ à faire.

## 9. Ce qui est implémenté, testé, et ce qui reste à faire

| | État |
|---|---|
| Parcours client, prestataire, admin ; 11 tables ; RLS ; stockage ; statuts ; notifications **dans l'application** ; favoris ; signalements ; journal admin | ✅ implémenté |
| Logique serveur, permissions, validation, images, RLS (PostgreSQL réel simulé), interface en navigateur (mode démo) | ✅ testé automatiquement |
| Connexion Pi réelle dans Pi Browser | ⚠️ **non testée** : code conforme à la documentation consultée, mais il faut une application enregistrée et un test sur Testnet |
| Adaptateur `SupabaseStore` sur un vrai projet Supabase (requêtes, stockage, URL signées) | ⚠️ **non testé en conditions réelles** (aucun projet Supabase n'a été créé ici) ; la logique au-dessus est identique à celle testée en mémoire |
| Déploiement Render, domaine, clé de validation | ⏳ intervention humaine |
| Approbation de l'application par Pi Network | ⏳ **pas obtenue** — le respect de ce cahier des charges ne la garantit pas |
| Paiements Pi (boutique uniquement) | ✅ implémentés côté serveur (approbation/finalisation, montant décidé et vérifié par le serveur) et testés avec une fausse API Pi ; ⏳ **non testés en conditions réelles** : exigent `PI_API_KEY`, le portefeuille de l'application et la vérification du domaine dans le Developer Portal. Absents des demandes et prestataires |

**Limites connues** : notifications visibles dans l'application uniquement (pas de notifications push) ; les échanges se rafraîchissent par interrogation toutes les 20 s (pas de temps réel) ; pas de notes/avis ; catalogues limités à 500 prestataires par requête (pagination à ajouter si besoin) ; les visuels de démonstration sont des recadrages basse définition des maquettes fournies — à remplacer par de vraies photos de réalisations ; la maquette violette fournie (« Payez en Pi », notes, prix) n'a **pas** été reprise : l'identité retenue suit le cahier des charges (vert/or/ivoire) et exclut paiements et tarifs hors boutique.

## 10. Données de démonstration

`supabase/seed.sql` et le mode démo en mémoire créent des prestataires **fictifs** (« … (démo) », comptes non connectables) et quelques réalisations tirées des visuels fournis. Aucun montant n'y figure.
