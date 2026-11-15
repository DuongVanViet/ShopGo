import { canonical, hash } from './crypto';
import { fail } from './errors';
import { one, Tx } from '../database/db';

export async function idempotent<T>(
  tx: Tx,
  principal: string,
  operation: string,
  key: string | undefined,
  payload: unknown,
  action: () => Promise<T>,
): Promise<T> {
  if (!key || key.length < 8 || key.length > 128 || !/^[\w.:-]+$/.test(key))
    fail('IDEMPOTENCY_KEY_REQUIRED', 'Cần Idempotency-Key từ 8–128 ký tự.', 400);
  const digest = hash(canonical(payload));
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `${principal}:${operation}:${key}`,
  ]);
  const old = await one(
    tx,
    'SELECT * FROM idempotency_records WHERE principal_id=$1 AND operation=$2 AND key=$3',
    [principal, operation, key],
  );
  if (old) {
    if (old.request_hash !== digest)
      fail('IDEMPOTENCY_CONFLICT', 'Khóa này đã dùng cho nội dung khác.');
    return old.response as T;
  }
  const result = await action();
  await tx.query(
    "INSERT INTO idempotency_records(principal_id,operation,key,request_hash,response,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours')",
    [principal, operation, key, digest, JSON.stringify(result)],
  );
  return result;
}
