#!/usr/bin/env node
/**
 * Garde-fou « aucun budget dans les demandes de service » : échoue si le code des demandes, des prestataires,
 * de l'exploration, du profil ou le schéma des demandes contiennent un vocabulaire financier (budget, tarif,
 * prix, devis, montant…) ou un flux de paiement Pi.
 * Seule la BOUTIQUE (produits à prix de test en Pi, commandes, paiement) peut en contenir : elle est listée
 * explicitement dans SHOP_FILES ci-dessous. Les tests sont exclus.
 */
const SHOP_FILES = [
  'server/src/routes/shop.ts',
  'server/src/routes/adminShop.ts',
  'server/src/lib/piPayments.ts',
  'server/src/lib/shopValidation.ts',
  'server/src/lib/payout.ts',
  'server/src/lib/stellar.ts',
  'server/src/routes/testnetPayout.ts',
  'supabase/migrations/0008_testnet_payouts.sql',
  'server/src/store/shopSeed.ts',
  'supabase/migrations/0006_shop.sql',
  'supabase/migrations/0007_products_seed.sql',
  'web/src/lib/shop.ts',
  'web/src/components/TestnetTests.tsx',
  'web/src/lib/pi.ts',
  'web/src/lib/auth.tsx',
  'web/src/styles.css',
  'web/src/pages/Home.tsx',
  'web/src/pages/Privacy.tsx',
  'web/src/pages/Terms.tsx',
  'web/src/pages/shop/',
  'web/src/pages/admin/AdminShop.tsx',
];
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['web/src', 'server/src', 'supabase', 'web/index.html'];
const EXT = /\.(ts|tsx|js|mjs|css|html|sql|json)$/;

const FINANCE = /\b(budgets?|tarifs?|tarification|prix|pric(?:e|es|ing)|montants?|amounts?|devis|estimations?|estimates?|cost|co[uû]ts?|frais|fees?|currency|devises?|EGP|USD|EUR|XOF|FCFA)\b|[€£]/i;
const PAYMENT_FLOW = /createPayment|\/payments\/|onReadyForServerApproval|onReadyForServerCompletion|PI_API_KEY\s*[:=]\s*['"][^'"]+['"]/;

const hits = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const n of readdirSync(p)) if (!['node_modules', 'dist', 'test', '.vite'].includes(n)) walk(path.join(p, n));
    return;
  }
  if (!EXT.test(p) || /\.test\.(ts|tsx)$/.test(p)) return;
  const rel = path.relative(root, p).split(path.sep).join('/');
  if (SHOP_FILES.some((f) => (f.endsWith('/') ? rel.startsWith(f) : rel === f))) return;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    // Les commentaires qui NIENT explicitement l'existence d'un budget ne sont pas du code : on les ignore.
    if (/^\s*(--|\/\/|\*|\/\*)/.test(line)) return;
    if (FINANCE.test(line)) hits.push(`${path.relative(root, p)}:${i + 1}  [vocabulaire financier]  ${line.trim().slice(0, 120)}`);
    if (PAYMENT_FLOW.test(line)) hits.push(`${path.relative(root, p)}:${i + 1}  [flux de paiement]  ${line.trim().slice(0, 120)}`);
  });
};
for (const d of DIRS) walk(path.join(root, d));

if (hits.length) {
  console.error(`✗ ${hits.length} occurrence(s) interdite(s) :\n` + hits.join('\n'));
  process.exit(1);
}
console.log('✓ Demandes, prestataires et exploration : aucun budget/tarif/prix/devis/montant ni paiement (seule la boutique en contient).');
