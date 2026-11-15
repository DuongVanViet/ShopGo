import { z } from 'zod';
import { fail } from './errors';

export const uuid = z.string().uuid();
export const version = z.number().int().positive();
export const money = z.number().int().min(0).max(1_000_000_000_000);
export const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: uuid.optional(),
});
export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    fail(
      'VALIDATION_ERROR',
      'Dữ liệu không hợp lệ.',
      400,
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  return result.data;
}
export function id(value: string): string {
  return parse(uuid, value);
}
