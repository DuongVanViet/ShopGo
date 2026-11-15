import { HttpException } from '@nestjs/common';

export function fail(code: string, message: string, status = 409, details?: unknown): never {
  throw new HttpException({ code, message, details }, status);
}
export function must<T>(
  value: T | null | undefined,
  code = 'NOT_FOUND',
  message = 'Không tìm thấy dữ liệu.',
  status = 404,
): T {
  if (value === null || value === undefined) fail(code, message, status);
  return value;
}
