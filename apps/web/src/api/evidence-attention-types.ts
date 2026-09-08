export type EvidenceAttentionState = 'NO_EVIDENCE' | 'AVAILABLE' | 'PENDING_REVIEW' | 'REVIEWED';

export type EvidenceAttentionItem = {
  evidenceId: string;
  mediaType: string;
  sizeBytes: number;
  displayFilename: string | null;
  createdAt: string;
};

export type EvidenceReviewTask = {
  taskId: string;
  title: string;
  status: 'OPEN' | 'COMPLETED';
  priority: 'NORMAL' | 'HIGH';
  assignedOperatorId: string | null;
  createdAt: string;
  completedAt: string | null;
  completedById: string | null;
};

export type ClaimEvidenceAttentionResponse = {
  claimId: string;
  trackingCode: string;
  attentionState: EvidenceAttentionState;
  evidenceCount: number;
  evidence: EvidenceAttentionItem[];
  reviewTasks: EvidenceReviewTask[];
  openReviewTaskCount: number;
  completedReviewTaskCount: number;
};
