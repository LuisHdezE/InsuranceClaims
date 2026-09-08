export const PIPELINE_CONSUMER_TYPES = ['CLAIM', 'RENEWAL', 'COLLECTION'] as const;
export type PipelineConsumerType = (typeof PIPELINE_CONSUMER_TYPES)[number];

export type PipelineVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type PipelineActorType = 'SYSTEM' | 'OPERATOR' | 'SUPERVISOR' | 'ADMINISTRATOR' | 'AUTOMATION';

export interface PipelineStageDefinition {
  id: string;
  key: string;
  displayName: string;
  sortOrder: number;
  allowedNextStageKeys: readonly string[];
}

export interface PipelineVersionDefinition {
  id: string;
  definitionId: string;
  consumerType: PipelineConsumerType;
  versionNumber: number;
  status: PipelineVersionStatus;
  stages: readonly PipelineStageDefinition[];
}

export interface PipelineWorkItemProps {
  id: string;
  consumerType: PipelineConsumerType;
  consumerId: string;
  pipelineDefinitionId: string;
  pipelineVersionId: string;
  currentStageId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class PipelineWorkItemVersionConflictError extends Error {
  constructor(readonly expectedVersion: number, readonly actualVersion: number) {
    super(`Expected PipelineWorkItem version ${expectedVersion} but found ${actualVersion}.`);
    this.name = 'PipelineWorkItemVersionConflictError';
  }
}

export class InvalidOperationalStageTransitionError extends Error {
  constructor(readonly fromStageKey: string, readonly toStageKey: string) {
    super(`Operational stage transition ${fromStageKey} -> ${toStageKey} is not allowed.`);
    this.name = 'InvalidOperationalStageTransitionError';
  }
}

export class PipelineWorkItem {
  private constructor(private readonly props: PipelineWorkItemProps) {}

  static create(input: Omit<PipelineWorkItemProps, 'version'>): PipelineWorkItem {
    return new PipelineWorkItem({ ...input, version: 1 });
  }

  static rehydrate(props: PipelineWorkItemProps): PipelineWorkItem {
    return new PipelineWorkItem({ ...props });
  }

  snapshot(): PipelineWorkItemProps {
    return { ...this.props };
  }

  move(input: {
    toStageKey: string;
    expectedVersion: number;
    pipelineVersion: PipelineVersionDefinition;
    at: Date;
  }): { fromStage: PipelineStageDefinition; toStage: PipelineStageDefinition } {
    if (this.props.version !== input.expectedVersion) {
      throw new PipelineWorkItemVersionConflictError(input.expectedVersion, this.props.version);
    }
    if (input.pipelineVersion.id !== this.props.pipelineVersionId || input.pipelineVersion.status === 'DRAFT') {
      throw new InvalidOperationalStageTransitionError('unknown', input.toStageKey);
    }
    const fromStage = input.pipelineVersion.stages.find((stage) => stage.id === this.props.currentStageId);
    const toStage = input.pipelineVersion.stages.find((stage) => stage.key === input.toStageKey);
    if (!fromStage || !toStage || !fromStage.allowedNextStageKeys.includes(toStage.key)) {
      throw new InvalidOperationalStageTransitionError(fromStage?.key ?? 'unknown', input.toStageKey);
    }
    this.props.currentStageId = toStage.id;
    this.props.version += 1;
    this.props.updatedAt = input.at;
    return { fromStage, toStage };
  }
}
