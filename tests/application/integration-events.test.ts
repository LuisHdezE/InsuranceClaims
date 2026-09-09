import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionsForRole, type ActorContext } from '@insurance/application';
import { IntegrationEventsApplication, IntegrationEventsApplicationError, type InboundEventProcessorPort, type IntegrationPrincipal } from '@insurance/application/integration-events';
import { MemoryIntegrationStore, SimulatedInboundEventProcessor } from '@insurance/infrastructure';

const integrationId = '81000000-0000-4000-8000-000000000001';
const integrationKey = 'syn-integration-001';
const keyId = 'syn-integration-key-001';

function actor(role: 'CLAIMS_OPERATOR' | 'PLATFORM_ADMIN'): ActorContext {
  return {
    operatorId: role === 'PLATFORM_ADMIN' ? '82000000-0000-4000-8000-000000000001' : '82000000-0000-4000-8000-000000000002',
    login: role === 'PLATFORM_ADMIN' ? 'integration.admin@example.invalid' : 'integration.operator@example.invalid',
    role,
    context: 'staff',
    permissions: permissionsForRole(role),
  };
}

function principal(): IntegrationPrincipal {
  return { integrationId, integrationKey, keyId, context: 'integration', permissions: ['integration.events.ingest'] };
}

function makeDependencies(store: MemoryIntegrationStore, processor: InboundEventProcessorPort) {
  let sequence = 1;
  return {
    repository: store,
    processor,
    clock: { now: () => new Date('2026-09-08T21:30:00.000Z') },
    ids: {
      uuid: () => `83000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
      trackingCode: () => 'SYN-INTEGRATION-TRACKING',
    },
  };
}

function seed(store: MemoryIntegrationStore): void {
  store.seedIntegration({
    id: integrationId,
    integrationKey,
    keyId,
    enabled: true,
    allowedEventSchemas: {
      SYNTHETIC_CUSTOMER_RESPONSE: {
        customerRef: 'STRING',
        accepted: 'BOOLEAN',
      },
    },
    createdAt: new Date('2026-09-08T20:00:00.000Z'),
    updatedAt: new Date('2026-09-08T20:00:00.000Z'),
    version: 1,
  });
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof IntegrationEventsApplicationError);
    assert.equal(error.code, code);
    return true;
  });
}

test('R3 integration acceptance is durable, schema-governed and replay-safe', async () => {
  const store = new MemoryIntegrationStore();
  seed(store);
  const app = new IntegrationEventsApplication(makeDependencies(store, new SimulatedInboundEventProcessor()));
  const payload = { customerRef: 'SYN-CUSTOMER-001', accepted: true } as const;

  const accepted = await app.ingestIntegrationEvent({
    externalEventId: 'syn-event-001',
    eventType: 'SYNTHETIC_CUSTOMER_RESPONSE',
    payload,
    payloadHash: 'a'.repeat(64),
  }, principal(), { requestId: 'integration-app-accept-1' });

  assert.equal(accepted.replayed, false);
  assert.equal(accepted.response.ingestionStatus, 'ACCEPTED');
  assert.equal(accepted.response.processingStatus, 'PENDING');
  assert.equal(store.audits.length, 1);
  assert.equal(store.audits[0]?.eventCode, 'INBOUND_EVENT_ACCEPTED');
  assert.equal(store.audits[0]?.actorType, 'INTEGRATION');

  const replay = await app.ingestIntegrationEvent({
    externalEventId: 'syn-event-001',
    eventType: 'SYNTHETIC_CUSTOMER_RESPONSE',
    payload,
    payloadHash: 'a'.repeat(64),
  }, principal());
  assert.equal(replay.replayed, true);
  assert.equal(replay.response.eventId, accepted.response.eventId);
  assert.equal(store.audits.length, 1);

  await expectCode(app.ingestIntegrationEvent({
    externalEventId: 'syn-event-001',
    eventType: 'SYNTHETIC_CUSTOMER_RESPONSE',
    payload,
    payloadHash: 'b'.repeat(64),
  }, principal()), 'INTEGRATION_REPLAY_DETECTED');

  await expectCode(app.ingestIntegrationEvent({
    externalEventId: 'syn-event-invalid-schema',
    eventType: 'SYNTHETIC_CUSTOMER_RESPONSE',
    payload: { customerRef: 'SYN-CUSTOMER-001', accepted: true, extra: 'not-approved' },
    payloadHash: 'c'.repeat(64),
  }, principal()), 'INTEGRATION_SCHEMA_INVALID');

  await expectCode(app.getIntegrationEventStatus(accepted.response.eventId, actor('CLAIMS_OPERATOR')), 'FORBIDDEN');
  const adminStatus = await app.getIntegrationEventStatus(accepted.response.eventId, actor('PLATFORM_ADMIN'));
  assert.equal(adminStatus.processingStatus, 'PENDING');

  const processed = await app.processInboundEvent(accepted.response.eventId, 'synthetic-worker-1');
  assert.equal(processed.processingStatus, 'PROCESSED');
  assert.ok(processed.processedAt);
  assert.equal(processed.failureCategory, null);

  const terminalReplay = await app.processInboundEvent(accepted.response.eventId, 'synthetic-worker-2');
  assert.equal(terminalReplay.processingStatus, 'PROCESSED');
});

test('R3 integration processing becomes dead-letter after bounded failed attempts without silent drop', async () => {
  const store = new MemoryIntegrationStore();
  seed(store);
  const failingProcessor: InboundEventProcessorPort = {
    async process() { return { outcome: 'FAILED', failureCategory: 'SYNTHETIC_PROCESSING_FAILURE' }; },
  };
  const app = new IntegrationEventsApplication(makeDependencies(store, failingProcessor));
  const accepted = await app.ingestIntegrationEvent({
    externalEventId: 'syn-event-dead-letter-001',
    eventType: 'SYNTHETIC_CUSTOMER_RESPONSE',
    payload: { customerRef: 'SYN-CUSTOMER-DL', accepted: false },
    payloadHash: 'd'.repeat(64),
  }, principal());

  const first = await app.processInboundEvent(accepted.response.eventId, 'synthetic-worker-dl');
  assert.equal(first.processingStatus, 'FAILED');
  assert.equal(first.failureCategory, 'SYNTHETIC_PROCESSING_FAILURE');

  const second = await app.processInboundEvent(accepted.response.eventId, 'synthetic-worker-dl');
  assert.equal(second.processingStatus, 'FAILED');

  const third = await app.processInboundEvent(accepted.response.eventId, 'synthetic-worker-dl');
  assert.equal(third.processingStatus, 'DEAD_LETTER');
  assert.equal(third.failureCategory, 'SYNTHETIC_PROCESSING_FAILURE');

  const fourth = await app.processInboundEvent(accepted.response.eventId, 'synthetic-worker-dl');
  assert.equal(fourth.processingStatus, 'DEAD_LETTER');

  const adminStatus = await app.getIntegrationEventStatus(accepted.response.eventId, actor('PLATFORM_ADMIN'));
  assert.equal(adminStatus.processingStatus, 'DEAD_LETTER');
});
