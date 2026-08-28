/**
 * Validated by app.ts so that both the long-running server and the serverless
 * entrypoint fail loudly. A missing SCAN_SALT would otherwise silently stop QR
 * scans from being recorded.
 */
export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.SCAN_SALT) {
    throw new Error(
      "SCAN_SALT must be set. Did you forget to configure the QR scan tracking salt?",
    );
  }
}
