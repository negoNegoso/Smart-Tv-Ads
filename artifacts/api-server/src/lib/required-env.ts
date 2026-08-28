/**
 * Validated by app.ts so that both the long-running server and the serverless
 * entrypoint fail loudly. SCAN_SALT protege o registro de scans; as variáveis
 * de admin e o SESSION_SECRET são exigidos para o login funcionar.
 */
const REQUIRED_KEYS = [
  "SCAN_SALT",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
] as const;

export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of REQUIRED_KEYS) {
    if (!env[key]) {
      throw new Error(
        `${key} must be set. Confira as variáveis de ambiente obrigatórias da API.`,
      );
    }
  }
}
