import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}
export function constantEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
