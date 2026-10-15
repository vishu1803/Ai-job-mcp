import { defineConfig } from 'drizzle-kit';
import { config } from './src/config/env.js';

export default defineConfig({
  schema: [
    './src/db/schema.js',
    './src/db/resume-studio.schema.js',
    './src/db/resume-generation.schema.js',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
