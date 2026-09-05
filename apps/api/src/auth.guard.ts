import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { AccessTokenPort } from '@insurance/application';
import { ACCESS_TOKENS } from './contracts.js';
import { ApiProblemError } from './transport.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(ACCESS_TOKENS) private readonly tokens: AccessTokenPort) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (!header.startsWith('Bearer ')) throw new ApiProblemError(401, 'AUTHENTICATION_REQUIRED', 'A valid bearer token is required.');
    const actor = await this.tokens.verify(header.slice(7));
    if (!actor) throw new ApiProblemError(401, 'AUTHENTICATION_REQUIRED', 'A valid bearer token is required.');
    req.actor = actor;
    return true;
  }
}
