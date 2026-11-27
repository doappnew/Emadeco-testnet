import { randomUUID } from 'node:crypto';
import { StoreError, type Bucket, type Query, type Row, type Store, type Table } from './types.js';

const TABLES: Table[] = [
  'profiles',
  'service_categories',
  'provider_profiles',
  'services',
  'portfolio_items',
  'service_requests',
  'request_messages',
  'favorites',
  'notifications',
  'reports',
  'admin_logs',
  'products',
  'orders',
  'testnet_payouts',
  'app_settings',
];

/** Colonne à valeur unique par table (équivalent d'une clé primaire SQL). */
const UNIQUE: Partial<Record<Table, string>> = { testnet_payouts: 'profile_id', app_settings: 'key' };

function matches(row: Row, q?: Query): boolean {
  if (!q) return true;
  for (const [k, v] of Object.entries(q.eq ?? {})) if (row[k] !== v) return false;
  for (const [k, v] of Object.entries(q.neq ?? {})) if (row[k] === v) return false;
  for (const [k, list] of Object.entries(q.in ?? {})) if (!list.includes(row[k])) return false;
  return true;
}

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private data = new Map<Table, Row[]>(TABLES.map((t) => [t, []]));
  private files = new Map<string, { data: Buffer; contentType: string }>();

  private rows(t: Table): Row[] {
    return this.data.get(t)!;
  }

  async select(table: Table, q?: Query): Promise<Row[]> {
    let out = this.rows(table).filter((r) => matches(r, q));
    if (q?.order) {
      const { col, asc = true } = q.order;
      out = [...out].sort((a, b) => {
        const x = a[col] ?? '';
        const y = b[col] ?? '';
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (q?.limit) out = out.slice(0, q.limit);
    return out.map((r) => structuredClone(r));
  }

  async insert(table: Table, rows: Row | Row[]): Promise<Row[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    const now = new Date().toISOString();
    const uniq = UNIQUE[table];
    if (uniq) {
      const seen = new Set(this.rows(table).map((r) => r[uniq]));
      for (const r of list) {
        if (seen.has(r[uniq])) throw new StoreError('Doublon.', '23505');
        seen.add(r[uniq]);
      }
    }
    const inserted = list.map((r) => ({ id: randomUUID(), created_at: now, ...structuredClone(r) }));
    this.rows(table).push(...inserted);
    return inserted.map((r) => structuredClone(r));
  }

  async update(table: Table, q: Query, patch: Row): Promise<Row[]> {
    const hit = this.rows(table).filter((r) => matches(r, q));
    const now = new Date().toISOString();
    for (const r of hit) Object.assign(r, structuredClone(patch), { updated_at: now });
    return hit.map((r) => structuredClone(r));
  }

  async remove(table: Table, q: Query): Promise<number> {
    const all = this.rows(table);
    const keep = all.filter((r) => !matches(r, q));
    const removed = all.length - keep.length;
    this.data.set(table, keep);
    return removed;
  }

  async count(table: Table, q?: Query): Promise<number> {
    return this.rows(table).filter((r) => matches(r, q)).length;
  }

  async putFile(bucket: Bucket, path: string, data: Buffer, contentType: string): Promise<void> {
    this.files.set(`${bucket}/${path}`, { data, contentType });
  }

  async removeFile(bucket: Bucket, path: string): Promise<void> {
    this.files.delete(`${bucket}/${path}`);
  }

  async fileUrl(bucket: Bucket, path: string): Promise<string | null> {
    const f = this.files.get(`${bucket}/${path}`);
    if (!f) return null;
    return `data:${f.contentType};base64,${f.data.toString('base64')}`;
  }

  /** Pour les tests. */
  hasFile(bucket: Bucket, path: string) {
    return this.files.has(`${bucket}/${path}`);
  }
}
