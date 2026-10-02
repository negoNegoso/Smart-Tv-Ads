import { isOutdatedTvApp } from "./tv-app-version";

/**
 * Aviso que o feed leva à TV: "cheque atualização do app agora". O servidor
 * só avisa — quem decide o que instalar continua sendo o app, lendo o
 * update.json do GitHub e conferindo o SHA-256 do APK. Um aviso forjado
 * consegue, no máximo, provocar uma checagem.
 */

/** Pedido do admin para de cutucar a TV depois disto. */
export const UPDATE_REQUEST_TTL_MINUTES = 15;

/**
 * Idade negativa (relógio do banco à frente do servidor) conta como recente:
 * o pedido acabou de ser feito.
 */
export function isRecentUpdateRequest(requestedAt: Date | null | undefined, now: Date): boolean {
  if (!requestedAt) return false;
  return now.getTime() - requestedAt.getTime() < UPDATE_REQUEST_TTL_MINUTES * 60 * 1000;
}

export interface AppUpdateSignal {
  /** Última release conhecida; nulo quando o servidor não conseguiu ler. */
  version: string | null;
  /** Quando o admin pediu, enquanto o pedido é recente. */
  forcedAt: Date | null;
}

export function appUpdateSignal(input: {
  appVersion: string | null;
  latestVersion: string | null;
  updateRequestedAt: Date | null | undefined;
  now: Date;
}): AppUpdateSignal | null {
  const forcedAt = isRecentUpdateRequest(input.updateRequestedAt, input.now) ? input.updateRequestedAt ?? null : null;
  // Mesma regra do selo "Desatualizada" do parque: só afirma quando dá para
  // comparar. Navegador, build de teste e GitHub fora ficam sem sinal automático.
  const outdated = isOutdatedTvApp(input.appVersion, input.latestVersion);
  if (!outdated && !forcedAt) return null;
  return { version: input.latestVersion, forcedAt };
}
