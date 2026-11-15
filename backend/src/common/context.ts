import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface Actor {
  id: string;
  is_admin: boolean;
  can_refund: boolean;
  session_id: string;
}
export interface ApiRequest extends Request {
  actor: Actor;
  requestId: string;
  rawBody?: Buffer;
}
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor =>
    ctx.switchToHttp().getRequest<ApiRequest>().actor,
);
