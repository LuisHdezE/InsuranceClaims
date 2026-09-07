import {
  ClaimsApplication,
  type ApplicationDependencies,
  type RequestContext,
} from './index.js';
import { ClaimTasksApplication } from './claim-tasks.js';

export class ClaimsOperationsApplication extends ClaimsApplication {
  constructor(
    private readonly operationsDeps: ApplicationDependencies,
    private readonly taskApplication: ClaimTasksApplication,
  ) {
    super(operationsDeps);
  }

  override async submitClaim(
    input: Parameters<ClaimsApplication['submitClaim']>[0],
    context: RequestContext = {},
  ): ReturnType<ClaimsApplication['submitClaim']> {
    const result = await super.submitClaim(input, context);
    try {
      const detail = await this.operationsDeps.claims.findByTrackingProof(
        result.response.trackingCode,
        input.policyReference,
      );
      if (detail) {
        await this.taskApplication.ensureInitialTasksForClaim({
          claimId: detail.claim.id,
          evidenceCount: detail.evidence.length,
          correlationId: context.requestId ?? null,
        });
      }
    } catch (error) {
      this.operationsDeps.logger.error('CLAIM_TASK_PROJECTION_FAILED', {
        trackingCode: result.response.trackingCode,
        requestId: context.requestId ?? null,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
    return result;
  }
}
