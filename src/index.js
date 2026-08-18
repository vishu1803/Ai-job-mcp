import { buildApp } from './app.js';
import { config } from './config/env.js';

const app = buildApp();

async function start() {
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(
      `Server listening on http://${config.HOST}:${config.PORT} in ${config.NODE_ENV} mode`
    );
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown lifecycle handlers
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, initiating graceful shutdown...`);
    try {
      await app.close();
      app.log.info('Server shutdown completed cleanly.');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during graceful shutdown');
      process.exit(1);
    }
  });
}

start();
