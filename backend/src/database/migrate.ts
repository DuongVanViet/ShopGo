import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

export async function migrate(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  const db = await pool.connect();
  try {
    await db.query("SELECT pg_advisory_lock(hashtext('shopgo:migrations'))");
    await db.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of (await readdir(join(__dirname, 'migrations')))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = await readFile(join(__dirname, 'migrations', name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await db.query('SELECT checksum FROM schema_migrations WHERE version=$1', [
        name,
      ]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(`Migration checksum changed: ${name}`);
        continue;
      }
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [
          name,
          checksum,
        ]);
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await db.query("SELECT pg_advisory_unlock(hashtext('shopgo:migrations'))");
    db.release();
    await pool.end();
  }
}
if (require.main === module) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  migrate(process.env.DATABASE_URL)
    .then(() => console.log('Migrations applied'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
