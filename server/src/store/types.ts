export type Row = Record<string, any>;

export type Table =
  | 'profiles'
  | 'service_categories'
  | 'provider_profiles'
  | 'services'
  | 'portfolio_items'
  | 'service_requests'
  | 'request_messages'
  | 'favorites'
  | 'notifications'
  | 'reports'
  | 'admin_logs'
  | 'products'
  | 'orders'
  | 'testnet_payouts'
  | 'app_settings';

export interface Query {
  eq?: Record<string, unknown>;
  neq?: Record<string, unknown>;
  in?: Record<string, unknown[]>;
  order?: { col: string; asc?: boolean };
  limit?: number;
}

export type Bucket = 'portfolio' | 'inspiration';

/**
 * Couche d'accès aux données. Deux implémentations : Supabase (production) et mémoire
 * (démonstration locale et tests). Toute la logique métier et les contrôles d'accès
 * vivent au-dessus de cette interface, donc sont identiques dans les deux cas.
 */
export interface Store {
  readonly kind: 'memory' | 'supabase';
  select(table: Table, q?: Query): Promise<Row[]>;
  insert(table: Table, rows: Row | Row[]): Promise<Row[]>;
  update(table: Table, q: Query, patch: Row): Promise<Row[]>;
  remove(table: Table, q: Query): Promise<number>;
  count(table: Table, q?: Query): Promise<number>;
  putFile(bucket: Bucket, path: string, data: Buffer, contentType: string): Promise<void>;
  removeFile(bucket: Bucket, path: string): Promise<void>;
  /** URL publique (portfolio) ou URL signée de courte durée (inspiration). */
  fileUrl(bucket: Bucket, path: string): Promise<string | null>;
}

export class StoreError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
