import type { AuditPort, IdempotencyPort, TransactionPort } from '@insurance/application';
import { BulkActionsApplication, type ClaimTransitionCommandPort } from '@insurance/application/bulk-actions';
import { SecureIdGenerator, Sha256HashAdapter, SystemClock } from './adapters.js';
import { WorkflowBulkOperationStore } from './bulk-operation-store.js';

export function createBulkActionsApplication(input: {
  application: ClaimTransitionCommandPort;
  store: IdempotencyPort & AuditPort & TransactionPort;
}): BulkActionsApplication {
  return new BulkActionsApplication({
    repository: new WorkflowBulkOperationStore(input.store),
    claims: input.application,
    clock: new SystemClock(),
    ids: new SecureIdGenerator(),
    hash: new Sha256HashAdapter(),
  });
}
