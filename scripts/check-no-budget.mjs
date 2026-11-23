#!/usr/bin/env node
/**
 * Garde-fou « aucun budget » : échoue si le code de l'application, les migrations SQL ou les données
 * de démonstration contiennent un vocabulaire financier (champ de budget, tarif, prix, devis, montant…)
 * ou un flux de paiement Pi non prévu. Les tests (qui citent ces mots pour vérifier leur refus) sont exclus.
 */
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
console.log('✓ Aucun champ ni terme de budget/tarif/prix/devis/montant, aucun flux de paiement dans le code applicatif.');
