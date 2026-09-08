import {
  ClaimsApplication,
  type ApplicationDependencies,
  type RequestContext,
} from './index.js';
import { ClaimPipelineApplication } from './claim-pipeline.js';
import { ClaimTasksApplication } from './claim-tasks.js';
import { ClaimsOperationalQueryApplication } from './claims-operational-query.js';

export class ClaimsOperationsApplication extends ClaimsApplication {
  constructor(
    private readonly operationsDeps: ApplicationDependencies,
    private readonly taskApplication: ClaimTasksApplication,
    private readonly pipelineApplication: ClaimPipelineApplication,
    private readonly operationalQueries: ClaimsOperationalQueryApplication,
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
    try {
      const detail = await this.operationsDeps.claims.findByTrackingProof(
        result.response.trackingCode,
        input.policyReference,
      );
      if (detail) {
        await this.pipelineApplication.ensureInitialClaimProjection({
          claimId: detail.claim.id,
          correlationId: context.requestId ?? null,
        });
      }
    } catch (error) {
      this.operationsDeps.logger.error('CLAIM_PIPELINE_PROJECTION_FAILED', {
        trackingCode: result.response.trackingCode,
        requestId: context.requestId ?? null,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
    return result;
  }

  override async listClaims(
    input: Parameters<ClaimsOperationalQueryApplication['listClaims']>[0],
    actor?: Parameters<ClaimsOperationalQueryApplication['listClaims']>[1],
  ) {
    return this.operationalQueries.listClaims(input, actor);
  }

  override async getClaimDetail(
    claimId: string,
    actor?: Parameters<ClaimsApplication['getClaimDetail']>[1],
  ) {
    const base = await super.getClaimDetail(claimId, actor);
    const detail = await this.operationsDeps.claims.getById(claimId);
    return {
      ...base,
      customerId: detail?.claim.customerId ?? null,
      policyId: detail?.claim.policyId ?? null,
    };
  }

  async getClaimsOperationalMetrics(
    input: Parameters<ClaimsOperationalQueryApplication['getClaimsOperationalMetrics']>[0],
    actor?: Parameters<ClaimsOperationalQueryApplication['getClaimsOperationalMetrics']>[1],
  ) {
    return this.operationalQueries.getClaimsOperationalMetrics(input, actor);
  }
}
