export const UNAUTHORIZED_EVENT = "auth:unauthorized";

/**
 * Envolve window.fetch para detectar respostas 401 de chamadas protegidas
 * (sessão expirada) e emitir um evento. O AuthGate escuta e volta ao login.
 * Ignora as próprias rotas /api/auth/* para não disparar durante o login.
 */
export function installAuthFetchGuard(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    try {
      const input = args[0];
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        response.status === 401 &&
        url.includes("/api/") &&
        !url.includes("/api/auth/")
      ) {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
    } catch {
      // best-effort: nunca quebrar o fetch original
    }
    return response;
  };
}
