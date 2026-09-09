import { SignJWT, jwtVerify } from 'jose';
import {
  CUSTOMER_PORTAL_PERMISSIONS,
  type CustomerAccessTokenPort,
  type CustomerAccountRecord,
  type CustomerActorContext,
} from '@insurance/application/customer-portal';

export class JwtCustomerAccessTokenAdapter implements CustomerAccessTokenPort {
  private readonly secret: Uint8Array;

  constructor(
    secret: string,
    private readonly issuer = 'insurance-claims-customer',
    private readonly audience = 'insurance-claims-customer-api',
  ) {
    if (secret.length < 32) throw new Error('Customer JWT secret must contain at least 32 characters.');
    if (!issuer.trim()) throw new Error('Customer JWT issuer is required.');
    if (!audience.trim()) throw new Error('Customer JWT audience is required.');
    this.secret = new TextEncoder().encode(secret);
  }

  async issue(account: Pick<CustomerAccountRecord, 'id' | 'customerId' | 'login'>, expiresInSeconds: number): Promise<string> {
    return new SignJWT({
      login: account.login,
      customerId: account.customerId,
      context: 'customer',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(account.id)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(`${expiresInSeconds}s`)
      .sign(this.secret);
  }

  async verify(token: string): Promise<CustomerActorContext | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
      });
      if (!payload.sub
        || payload.context !== 'customer'
        || typeof payload.login !== 'string'
        || typeof payload.customerId !== 'string') return null;
      return {
        accountId: payload.sub,
        customerId: payload.customerId,
        login: payload.login,
        context: 'customer',
        permissions: CUSTOMER_PORTAL_PERMISSIONS,
      };
    } catch {
      return null;
    }
  }
}
