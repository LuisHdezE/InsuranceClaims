import type {
  CollectionPaymentStateVerifier,
  CollectionPaymentStateVerificationResult,
} from '@insurance/application/collections';

export const COLLECTION_PAYMENT_VERIFICATION_POLICY = 'SERVER_CONFIGURED_SYNTHETIC_ALLOWLIST';

export class ConfiguredCollectionPaymentStateVerifier implements CollectionPaymentStateVerifier {
  private readonly approvedStates: ReadonlySet<string>;

  constructor(values: readonly string[]) {
    const normalized = values.map((value) => value.trim());
    if (normalized.some((value) => !value || value.length > 80)) {
      throw new Error('Configured Collection payment-state values must contain 1 to 80 characters.');
    }
    this.approvedStates = new Set(normalized);
  }

  async verify(input: {
    requestedPaymentState: string;
  }): Promise<CollectionPaymentStateVerificationResult> {
    const requested = input.requestedPaymentState.trim();
    if (!this.approvedStates.has(requested)) return { approved: false };
    return {
      approved: true,
      paymentState: requested,
      verificationPolicy: COLLECTION_PAYMENT_VERIFICATION_POLICY,
    };
  }
}
