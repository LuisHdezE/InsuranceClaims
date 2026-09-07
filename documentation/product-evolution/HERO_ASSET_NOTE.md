# Hero asset implementation note

The current public Home hero JPEG is intentionally treated as a temporary delivery artifact. The visual target requires a higher-fidelity photographic asset. Binary uploads through the current repository automation path have repeatedly truncated larger image payloads, so the implementation must not silently accept degraded image quality as the final baseline.

Acceptance for the final hero asset:
- photographic, synthetic/non-customer imagery;
- no visible block compression at 1440px desktop viewport;
- minimum effective source width 1600px;
- correct browser decode and MIME type;
- local/repository-hosted asset preferred over remote hotlinking;
- human visual approval required before closing Home fidelity work.
