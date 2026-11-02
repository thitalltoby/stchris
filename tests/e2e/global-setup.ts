import { execSync } from 'node:child_process';
import { Client } from 'pg';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stchris:stchris_dev@localhost:5432/stchris_test';

/** Reset the dedicated e2e database to a known state: empty tables, then the standard seed plus demo staff. */
export default async function globalSetup() {
  const c = new Client({ connectionString: TEST_DB.replace('', '') });
  await c.connect();
  const { rows } = await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '\\_prisma%'`);
  if (rows.length) await c.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await c.end();
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: TEST_DB, SEED_DEMO_USERS: 'true', NODE_ENV: 'development' } });
}
