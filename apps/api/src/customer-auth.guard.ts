import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { AccessTokenPort } from '@insurance/application';
import type { CustomerAccessTokenPort } from '@insurance/application/customer-portal';
import { ACCESS_TOKENS, CUSTOMER_ACCESS_TOKENS } from './contracts.js';
import { ApiProblemError } from './transport.js';

@Injectable()
export class CustomerJwtAuthGuard implements CanActivate {
  constructor(
    @Inject(CUSTOMER_ACCESS_TOKENS) private readonly customerTokens: CustomerAccessTokenPort,
    @Inject(ACCESS_TOKENS) private readonly staffTokens: AccessTokenPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (!header.startsWith('Bearer ')) throw new ApiProblemError(401, 'AUTHENTICATION_REQUIRED', 'A valid bearer token is required.');
    const token = header.slice(7);
    const actor = await this.customerTokens.verify(token);
    if (actor) {
      req.customerActor = actor;
      return true;
    }
    if (await this.staffTokens.verify(token)) {
      throw new ApiProblemError(401, 'AUTHENTICATION_CONTEXT_MISMATCH', 'The bearer token belongs to a different authentication context.');
    }
    throw new ApiProblemError(401, 'AUTHENTICATION_REQUIRED', 'A valid bearer token is required.');
  }
}
