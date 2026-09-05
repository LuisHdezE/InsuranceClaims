import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import {
  permissionsForRole,
  type AccessTokenPort,
  type ActorContext,
  type ClockPort,
  type EvidenceStoragePort,
  type HashPort,
  type IdGeneratorPort,
  type OperatorRecord,
  type PasswordHasherPort,
  type PolicyVerificationPort,
  type PolicyVerificationResult,
  type TechnicalLoggerPort,
} from '@insurance/application';

export class SystemClock implements ClockPort {
  now(): Date { return new Date(); }
}

export class SecureIdGenerator implements IdGeneratorPort {
  uuid(): string { return randomUUID(); }
  trackingCode(): string { return `IC-${randomBytes(18).toString('base64url')}`; }
}

export class Sha256HashAdapter implements HashPort {
  async sha256(value: string | Uint8Array): Promise<string> {
    return createHash('sha256').update(value).digest('hex');
  }
}

export class JsonConsoleLogger implements TechnicalLoggerPort {
  error(event: string, metadata: Record<string, unknown> = {}): void {
    console.error(JSON.stringify({ level: 'error', event, ...metadata }));
  }
  info(event: string, metadata: Record<string, unknown> = {}): void {
    console.info(JSON.stringify({ level: 'info', event, ...metadata }));
  }
}

export class Argon2PasswordHasher implements PasswordHasherPort {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }
  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}

export class JwtAccessTokenAdapter implements AccessTokenPort {
  private readonly secret: Uint8Array;
  constructor(secret: string) {
    if (secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
    this.secret = new TextEncoder().encode(secret);
  }

  async issue(operator: Pick<OperatorRecord, 'id' | 'login' | 'role'>, expiresInSeconds: number): Promise<string> {
    return new SignJWT({ login: operator.login, role: operator.role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(operator.id)
      .setIssuedAt()
      .setExpirationTime(`${expiresInSeconds}s`)
      .sign(this.secret);
  }

  async verify(token: string): Promise<ActorContext | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] });
      if (!payload.sub || payload.role !== 'CLAIMS_OPERATOR' || typeof payload.login !== 'string') return null;
      return {
        operatorId: payload.sub,
        login: payload.login,
        role: 'CLAIMS_OPERATOR',
        permissions: permissionsForRole('CLAIMS_OPERATOR'),
      };
    } catch {
      return null;
    }
  }
}

function safeDisplayName(name: string): string {
  const leaf = basename(name || 'evidence').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
  return leaf || 'evidence';
}

export class LocalPrivateEvidenceStorage implements EvidenceStoragePort {
  constructor(private readonly root: string) {}

  async stage(input: { evidenceId: string; bytes: Uint8Array; mediaType: string; originalName: string }) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const storageKey = `${input.evidenceId}-${randomBytes(12).toString('hex')}`;
    await writeFile(join(this.root, storageKey), input.bytes, { mode: 0o600 });
    return { storageKey, displayFilename: safeDisplayName(input.originalName) };
  }

  read(storageKey: string): Promise<Uint8Array> {
    if (!/^[a-zA-Z0-9-]+$/.test(storageKey)) return Promise.reject(new Error('Invalid storage key.'));
    return readFile(join(this.root, storageKey));
  }

  async cleanup(storageKey: string): Promise<void> {
    if (!/^[a-zA-Z0-9-]+$/.test(storageKey)) return;
    await rm(join(this.root, storageKey), { force: true });
  }
}

export class MemoryEvidenceStorage implements EvidenceStoragePort {
  private readonly files = new Map<string, Uint8Array>();
  async stage(input: { evidenceId: string; bytes: Uint8Array; mediaType: string; originalName: string }) {
    const storageKey = `memory-${input.evidenceId}-${randomBytes(4).toString('hex')}`;
    this.files.set(storageKey, Uint8Array.from(input.bytes));
    return { storageKey, displayFilename: safeDisplayName(input.originalName) };
  }
  async read(storageKey: string): Promise<Uint8Array> {
    const bytes = this.files.get(storageKey);
    if (!bytes) throw new Error('Evidence not found.');
    return Uint8Array.from(bytes);
  }
  async cleanup(storageKey: string): Promise<void> { this.files.delete(storageKey); }
}

export class HttpPolicyVerificationAdapter implements PolicyVerificationPort {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 2500) {}

  async verify(policyReference: string, vehicleReference: string, requestId?: string): Promise<PolicyVerificationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/legacy/v1/policy-vehicle/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(requestId ? { 'x-request-id': requestId } : {}) },
        body: JSON.stringify({ policy_no: policyReference, vehicle_ref: vehicleReference }),
        signal: controller.signal,
      });
      if (!response.ok) return response.status >= 500 ? { status: 'UNAVAILABLE' } : { status: 'NOT_ELIGIBLE' };
      const payload = await response.json() as Record<string, unknown>;
      if (payload.policy_no !== policyReference || payload.vehicle_ref !== vehicleReference) return { status: 'UNAVAILABLE' };
      if (payload.matched_flag !== 'Y' || payload.active_flag !== 'Y') return { status: 'NOT_ELIGIBLE' };
      return {
        status: 'ELIGIBLE',
        policyReference,
        vehicleReference,
        customerLabel: typeof payload.holder_label === 'string' ? payload.holder_label.slice(0, 160) : null,
      };
    } catch {
      return { status: 'UNAVAILABLE' };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class MemoryPolicyVerificationAdapter implements PolicyVerificationPort {
  constructor(private readonly eligiblePairs = new Map<string, string | null>([
    ['SYN-POL-001|SYN-VEH-001', 'Synthetic Customer A'],
    ['SYN-POL-002|SYN-VEH-002', 'Synthetic Customer B'],
  ])) {}
  async verify(policyReference: string, vehicleReference: string): Promise<PolicyVerificationResult> {
    const key = `${policyReference}|${vehicleReference}`;
    if (!this.eligiblePairs.has(key)) return { status: 'NOT_ELIGIBLE' };
    return { status: 'ELIGIBLE', policyReference, vehicleReference, customerLabel: this.eligiblePairs.get(key) ?? null };
  }
}
