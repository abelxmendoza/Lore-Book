import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './apps/server/src/db/drizzle/schema.ts',
  out: './supabase/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
