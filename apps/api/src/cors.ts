import type { INestApplication } from '@nestjs/common';

const ALLOWED_HEADERS = [
  'Accept',
  'Authorization',
  'Content-Type',
  'Idempotency-Key',
  'X-Request-Id',
] as const;

const EXPOSED_HEADERS = [
  'X-Request-Id',
  'Idempotency-Replayed',
  'Retry-After',
  'Content-Disposition',
] as const;

export function parseCorsAllowedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];

  const origins = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error(`CORS_ALLOWED_ORIGINS contains an invalid URL: ${value}`);
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`CORS_ALLOWED_ORIGINS only accepts http/https origins: ${value}`);
      }
      if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
        throw new Error(`CORS_ALLOWED_ORIGINS must contain origins only, without credentials, paths, query strings or fragments: ${value}`);
      }
      return parsed.origin;
    });

  return [...new Set(origins)];
}

export function configureCors(app: Pick<INestApplication, 'enableCors'>, env: NodeJS.ProcessEnv = process.env): void {
  const origins = parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const demoMode = env.DEMO_MODE === 'true';
  const production = env.NODE_ENV === 'production';

  if (demoMode && production && origins.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS is required when DEMO_MODE=true in production.');
  }

  if (origins.length === 0) return;

  app.enableCors({
    origin: origins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [...ALLOWED_HEADERS],
    exposedHeaders: [...EXPOSED_HEADERS],
    credentials: false,
  });
}
