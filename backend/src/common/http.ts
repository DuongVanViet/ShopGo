import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { randomUUID } from 'node:crypto';
import type { Response, NextFunction } from 'express';
import { ApiRequest } from './context';

export function requestContext(req: ApiRequest, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  req.requestId =
    typeof incoming === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
export function toJson(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        toJson(v),
      ]),
    );
  return value;
}
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => ({
        data: toJson(data),
        meta: { requestId: context.switchToHttp().getRequest<ApiRequest>().requestId },
      })),
    );
  }
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<ApiRequest>();
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: any = { code: 'INTERNAL_ERROR', message: 'Hệ thống tạm thời gặp lỗi.' };
    if (error instanceof HttpException) {
      status = error.getStatus();
      const raw = error.getResponse();
      body =
        typeof raw === 'object'
          ? { code: `HTTP_${status}`, ...raw }
          : { code: `HTTP_${status}`, message: raw };
    } else if (error.type === 'entity.too.large') {
      status = 413;
      body = { code: 'BODY_TOO_LARGE', message: 'Nội dung gửi vượt giới hạn.' };
    } else if (error.type === 'entity.parse.failed') {
      status = 400;
      body = { code: 'INVALID_JSON', message: 'JSON không hợp lệ.' };
    } else if (error.code === '23505') {
      status = 409;
      body = { code: 'DUPLICATE_RESOURCE', message: 'Dữ liệu đã tồn tại.' };
    } else if (['23503', '23514', '22P02'].includes(error.code)) {
      status = 422;
      body = { code: 'DATA_CONSTRAINT', message: 'Dữ liệu vi phạm ràng buộc nghiệp vụ.' };
    } else if (['40001', '40P01'].includes(error.code)) {
      status = 409;
      body = {
        code: 'CONCURRENT_CONFLICT',
        message: 'Có thao tác đồng thời. Vui lòng gửi lại cùng khóa.',
      };
    }
    if (status >= 500)
      console.error(
        JSON.stringify({ requestId: req.requestId, error: error.name, code: body.code }),
      );
    res.status(status).json({ error: body, meta: { requestId: req.requestId } });
  }
}
