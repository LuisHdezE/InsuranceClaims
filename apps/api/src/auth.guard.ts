import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { AccessTokenPort } from '@insurance/application';
import type { CustomerAccessTokenPort } from '@insurance/application/customer-portal';
import { ACCESS_TOKENS, CUSTOMER_ACCESS_TOKENS } from './contracts.js';
import {
  isAllowedPublicDemoReadPath,
  isDemoModeEnabled,
  isPublicDemoOperator,
  isSafeReadOnlyMethod,
} from './demo-access.js';
import { ApiProblemError } from './transport.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKENS) private readonly tokens: AccessTokenPort,
    @Inject(CUSTOMER_ACCESS_TOKENS) private readonly customerTokens: CustomerAccessTokenPort,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (!header.startsWith('Bearer ')) throw new ApiProblemError(401, 'AUTHENTICATION_REQUIRED', 'A valid bearer token is required.');
    const token = header.slice(7);
    const actor = await this.tokens.verify(token);
    if (actor) {
      if (isDemoModeEnabled() && isPublicDemoOperator(actor)) {
        if (!isSafeReadOnlyMethod(req.method)) {
          throw new ApiProblemError(403, 'DEMO_READ_ONLY', 'The public demo session is read-only.');
        }
        const requestPath = typeof req.path === 'string'
          ? req.path
          : typeof req.originalUrl === 'string'
            ? req.originalUrl.split('?')[0]
            : '';
        if (!isAllowedPublicDemoReadPath(requestPath, actor)) {
          throw new ApiProblemError(403, 'DEMO_SCOPE_RESTRICTED', 'The public demo session cannot read this module for the selected demo persona.');
        }
      }
      req.actor = actor;
      return true;
    }
    if (await this.customerTokens.verify(token)) {
      throw new ApiProblemError(401, 'AUTHENTICATION_CONTEXT_MISMATCH', 'The bearer token belongs to a different authentication context.');
    }
    throw new ApiProblemError(401, 'AUTHENTICATION_REQUIRED', 'A valid bearer token is required.');
  }
}
