import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { ApiRequest } from '../../common/context';
import { fail } from '../../common/errors';

export const Public = () => SetMetadata('public', true);
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<ApiRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ') || header.length > 512)
      fail('AUTH_REQUIRED', 'Cần Bearer token.', 401);
    req.actor = await this.auth.authenticate(header.slice(7));
    return true;
  }
}
