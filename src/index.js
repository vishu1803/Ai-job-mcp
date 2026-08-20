import { buildApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

const app = buildApp();

async function start() {
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    logger.info(
      { host: config.HOST, port: config.PORT, env: config.NODE_ENV },
      `Server listening on http://${config.HOST}:${config.PORT} in ${config.NODE_ENV} mode`
    );
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown lifecycle handlers
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    logger.info({ signal }, `Received ${signal}, initiating graceful shutdown...`);
    try {
      await app.close();
      logger.info({ signal }, 'Server shutdown completed cleanly.');
      process.exit(0);
    } catch (err) {
      logger.error({ err, signal }, 'Error during graceful shutdown');
      process.exit(1);
    }
  });
}

start();
