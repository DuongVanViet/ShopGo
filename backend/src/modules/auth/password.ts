import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { fail } from '../../common/errors';

// OWASP scrypt profile: 32 MiB, N=2^15, r=8, p=3. Limit concurrent KDFs.
let active = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= 4) fail('AUTH_BUSY', 'Có nhiều yêu cầu xác thực. Vui lòng thử lại sau.', 429);
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        salt,
        64,
        { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    active--;
  }
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16),
    key = await derive(password, salt);
  return `scrypt$1$32768$8$3$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  const match = encoded?.match(/^scrypt\$1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  const salt = match ? Buffer.from(match[1], 'hex') : Buffer.alloc(16),
    expected = match ? Buffer.from(match[2], 'hex') : Buffer.alloc(64);
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected) && !!match;
}
