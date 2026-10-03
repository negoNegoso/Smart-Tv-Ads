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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Quanto do histórico de conexão é guardado. 90 dias porque o gráfico de TVs
 * que funcionaram, na Visão geral do admin, cobre até 90 dias.
 */
export const SESSION_HISTORY_DAYS = 90;

export function sessionHistorySince(now: Date): Date {
  return new Date(now.getTime() - SESSION_HISTORY_DAYS * DAY_MS);
}

/**
 * Quanto a linha do tempo da página da TV mostra. Separado do que é guardado:
 * guardar mais para a Visão geral não deve alongar a lista de quedas da TV.
 */
export const SESSION_TIMELINE_DAYS = 30;

export function sessionTimelineSince(now: Date): Date {
  return new Date(now.getTime() - SESSION_TIMELINE_DAYS * DAY_MS);
}
