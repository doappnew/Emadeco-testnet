import type { Config } from '../config.js';
import { logger } from '../lib/logger.js';
import { seedCategories, seedDemo } from './demoData.js';
import { MemoryStore } from './memory.js';
import { SupabaseStore } from './supabase.js';
import type { Store } from './types.js';

export async function createStore(config: Config): Promise<Store> {
  if (config.supabase) {
    logger.info('Base de données : Supabase');
    return new SupabaseStore(config.supabase.url, config.supabase.serviceKey);
  }
  const mem = new MemoryStore();
  await seedCategories(mem);
  if (config.demoMode) {
    await seedDemo(mem);
    logger.warn('MODE DÉMONSTRATION : données en mémoire, fictives, perdues à l’arrêt. Ne pas utiliser en production.');
  } else {
    logger.warn('Supabase non configuré : base en mémoire vide.');
  }
  return mem;
}

export * from './types.js';
