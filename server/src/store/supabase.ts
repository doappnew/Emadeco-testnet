import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';
import { StoreError, type Bucket, type Query, type Row, type Store, type Table } from './types.js';

/**
 * Implémentation Supabase. La clé service_role reste exclusivement côté serveur ;
 * elle contourne RLS, d'où l'importance des contrôles de rôle dans les routes.
 */
export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private fail(op: string, table: string, error: { message: string; code?: string }): never {
    // Seuls l'opération, la table et le code d'erreur sont journalisés (pas de données).
    logger.error(`db: ${op} ${table} a échoué`, { code: error.code, message: error.message });
    throw new StoreError('Erreur de base de données.', error.code);
  }

  private apply(qb: any, q?: Query) {
    if (!q) return qb;
    for (const [k, v] of Object.entries(q.eq ?? {})) qb = v === null ? qb.is(k, null) : qb.eq(k, v);
    for (const [k, v] of Object.entries(q.neq ?? {})) qb = qb.neq(k, v);
    for (const [k, list] of Object.entries(q.in ?? {})) qb = qb.in(k, list as any[]);
    return qb;
  }

  async select(table: Table, q?: Query): Promise<Row[]> {
    let qb: any = this.apply(this.db.from(table).select('*'), q);
    if (q?.order) qb = qb.order(q.order.col, { ascending: q.order.asc ?? true });
    if (q?.limit) qb = qb.limit(q.limit);
    const { data, error } = await qb;
    if (error) this.fail('select', table, error);
    return data ?? [];
  }

  async insert(table: Table, rows: Row | Row[]): Promise<Row[]> {
    const { data, error } = await this.db.from(table).insert(rows as any).select('*');
    if (error) this.fail('insert', table, error);
    return (data as Row[]) ?? [];
  }

  async update(table: Table, q: Query, patch: Row): Promise<Row[]> {
    const { data, error } = await this.apply(this.db.from(table).update(patch), q).select('*');
    if (error) this.fail('update', table, error);
    return (data as Row[]) ?? [];
  }

  async remove(table: Table, q: Query): Promise<number> {
    const { data, error } = await this.apply(this.db.from(table).delete(), q).select('id');
    if (error) this.fail('delete', table, error);
    return (data as Row[] | null)?.length ?? 0;
  }

  async count(table: Table, q?: Query): Promise<number> {
    const { count, error } = await this.apply(this.db.from(table).select('*', { count: 'exact', head: true }), q);
    if (error) this.fail('count', table, error);
    return count ?? 0;
  }

  async putFile(bucket: Bucket, path: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.db.storage.from(bucket).upload(path, data, { contentType, upsert: false });
    if (error) this.fail('upload', bucket, { message: error.message });
  }

  async removeFile(bucket: Bucket, path: string): Promise<void> {
    const { error } = await this.db.storage.from(bucket).remove([path]);
    if (error) logger.warn('storage: suppression impossible', { bucket });
  }

  async fileUrl(bucket: Bucket, path: string): Promise<string | null> {
    if (bucket === 'portfolio') return this.db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    const { data, error } = await this.db.storage.from(bucket).createSignedUrl(path, 600);
    return error ? null : data.signedUrl;
  }
}
