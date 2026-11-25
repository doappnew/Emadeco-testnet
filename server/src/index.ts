import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { startKeepAlive } from './lib/keepAlive.js';
import { logger } from './lib/logger.js';
import { createStore } from './store/index.js';

async function main() {
  const config = loadConfig();
  const store = await createStore(config);
  const app = createApp({ config, store });
  app.listen(config.port, () => {
    logger.info(`EMADECO démarré sur le port ${config.port}`, {
      env: config.env,
      store: store.kind,
      pi_network: config.pi.network,
      demo_mode: config.demoMode,
    });
    startKeepAlive();
  });
}

main().catch((err) => {
  logger.error('démarrage impossible', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
