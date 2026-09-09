import type { AsyncJobProps } from '@insurance/domain';
import type { AsyncOperationsApplication, WorkerPrincipal } from '@insurance/application/async-operations';
import type { AutomationExecutionApplication } from '@insurance/application/automation-execution';
import type { IntegrationEventsApplication } from '@insurance/application/integration-events';

export interface WorkerRuntime {
  asyncOperations: AsyncOperationsApplication;
  integrations: IntegrationEventsApplication;
  automationExecution: AutomationExecutionApplication;
}

export interface WorkerTickResult {
  inspected: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

function stringField(job: AsyncJobProps, key: string): string | null {
  const value = job.payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export class DurableAsyncWorker {
  private readonly principal: WorkerPrincipal;

  constructor(
    private readonly runtime: WorkerRuntime,
    private readonly workerId: string,
    private readonly leaseSeconds = 60,
    private readonly batchSize = 25,
  ) {
    this.principal = { context: 'system', actorId: workerId, capabilities: ['async.jobs.execute'] };
  }

  async tick(): Promise<WorkerTickResult> {
    const jobs = await this.runtime.asyncOperations.listDueJobs(this.batchSize, this.principal);
    const result: WorkerTickResult = { inspected: jobs.length, succeeded: 0, failed: 0, skipped: 0 };
    for (const job of jobs) {
      const outcome = await this.process(job);
      result[outcome] += 1;
    }
    return result;
  }

  private async process(job: AsyncJobProps): Promise<'succeeded' | 'failed' | 'skipped'> {
    if (job.jobType === 'PROCESS_INBOUND_EVENT') {
      const eventId = stringField(job, 'eventId');
      if (!eventId) return this.failUnsupportedOrMalformed(job, 'ASYNC_JOB_PAYLOAD_INVALID');
      // IntegrationEventsApplication owns the single authoritative lease for this job family.
      // The worker deliberately does not lease it a second time.
      const status = await this.runtime.integrations.processInboundEvent(eventId, this.workerId);
      if (status.processingStatus === 'PROCESSED') return 'succeeded';
      if (status.processingStatus === 'FAILED' || status.processingStatus === 'DEAD_LETTER') return 'failed';
      return 'skipped';
    }

    if (job.jobType === 'RESUME_AUTOMATION_EXECUTION') {
      const executionId = stringField(job, 'executionId');
      if (!executionId) return this.failUnsupportedOrMalformed(job, 'ASYNC_JOB_PAYLOAD_INVALID');
      let leased: AsyncJobProps;
      try {
        leased = await this.runtime.asyncOperations.leaseJob(job, this.workerId, this.leaseSeconds, this.principal);
      } catch (error) {
        if ((error as { code?: string }).code === 'ASYNC_JOB_BUSY' || (error as { code?: string }).code === 'ASYNC_JOB_TERMINAL') return 'skipped';
        throw error;
      }
      try {
        await this.runtime.automationExecution.resumeExecution(executionId);
        const finished = await this.runtime.asyncOperations.finishJob({ job: leased, leaseOwner: this.workerId, outcome: 'SUCCEEDED' }, this.principal);
        return finished?.status === 'SUCCEEDED' ? 'succeeded' : 'skipped';
      } catch {
        const finished = await this.runtime.asyncOperations.finishJob({
          job: leased,
          leaseOwner: this.workerId,
          outcome: 'FAILED',
          retryable: true,
          failureCategory: 'AUTOMATION_RESUME_FAILED',
        }, this.principal);
        return finished ? 'failed' : 'skipped';
      }
    }

    return this.failUnsupportedOrMalformed(job, 'UNSUPPORTED_JOB_TYPE');
  }

  private async failUnsupportedOrMalformed(job: AsyncJobProps, failureCategory: string): Promise<'failed' | 'skipped'> {
    let leased: AsyncJobProps;
    try {
      leased = await this.runtime.asyncOperations.leaseJob(job, this.workerId, this.leaseSeconds, this.principal);
    } catch (error) {
      if ((error as { code?: string }).code === 'ASYNC_JOB_BUSY' || (error as { code?: string }).code === 'ASYNC_JOB_TERMINAL') return 'skipped';
      throw error;
    }
    const finished = await this.runtime.asyncOperations.finishJob({
      job: leased,
      leaseOwner: this.workerId,
      outcome: 'FAILED',
      retryable: false,
      failureCategory,
    }, this.principal);
    return finished ? 'failed' : 'skipped';
  }
}
