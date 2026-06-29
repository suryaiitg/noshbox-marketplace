import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, closePool, loadEnv } from './index';

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await getPool().query<{ name: string }>('SELECT name FROM _migrations');
  return new Set(rows.map((r) => r.name));
}

async function reset(): Promise<void> {
  console.log('Resetting database (DROP SCHEMA public CASCADE)...');
  await getPool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

async function run(): Promise<void> {
  if (process.argv.includes('--reset')) {
    await reset();
  }
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const pool = getPool();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= skip    ${file}`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`+ applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('Migrations up to date.');
}

run()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
