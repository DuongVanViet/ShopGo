import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { ENV, Env } from '../config/env';

types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds safe JSON range');
  return number;
});
export type Tx = PoolClient;
export async function rows<T extends QueryResultRow = any>(
  db: Pick<Tx, 'query'>,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, values)).rows;
}
export async function one<T extends QueryResultRow = any>(
  db: Pick<Tx, 'query'>,
  sql: string,
  values: unknown[] = [],
): Promise<T | undefined> {
  return (await rows<T>(db, sql, values))[0];
}
@Injectable()
export class Db implements OnModuleDestroy {
  readonly pool: Pool;
  constructor(@Inject(ENV) env: Env) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
    });
  }
  async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await client.query("SET LOCAL statement_timeout = '10s'");
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        const code = (error as { code?: string }).code;
        if (attempt < 4 && (code === '40001' || code === '40P01' || code === '23505')) {
          await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
