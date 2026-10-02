/**
 * Presença das TVs. Não importa o banco de propósito: portal, parque e
 * sessões de conexão usam a mesma janela, e ela precisa ser testável sozinha.
 */

/**
 * "TVs online agora" é presença, não histórico: cinco minutos é o intervalo
 * em que uma tela saudável reporta (ela busca o feed a cada 60 s). O card diz
 * "agora" e o número precisa concordar com isso.
 */
export const DEVICE_ONLINE_WINDOW_MINUTES = 5;

export function onlineSince(now: Date): Date {
  return new Date(now.getTime() - DEVICE_ONLINE_WINDOW_MINUTES * 60 * 1000);
}

/** Nulo (TV que nunca reportou) é offline, não "não sei". */
export function isOnlineAt(lastSeenAt: Date | null, now: Date): boolean {
  return lastSeenAt !== null && lastSeenAt.getTime() >= onlineSince(now).getTime();
}

/** Quanto do histórico de conexão é guardado e mostrado. */
export const SESSION_HISTORY_DAYS = 30;

export function sessionHistorySince(now: Date): Date {
  return new Date(now.getTime() - SESSION_HISTORY_DAYS * 24 * 60 * 60 * 1000);
}
