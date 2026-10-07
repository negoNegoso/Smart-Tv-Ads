/** Alvo do aviso. `targetMode` vem do banco como texto. */
export type AlertTarget = { targetMode: string; segmentIds: number[]; companyIds: number[] };

/** Janela do aviso: começa na criação, termina em `endsAt` ou quando o admin encerra. */
export type AlertWindow = { startsAt: Date; endsAt: Date; endedAt: Date | null; createdAt: Date };

export type AlertDevice = { companyId: number; segmentId: number | null };

export type AlertStatus = "active" | "expired" | "ended";

/**
 * O aviso vale para esta TV? Por segmento, TV de empresa sem segmento fica de
 * fora — mesma regra das campanhas: não dá para afirmar que é do ramo. Modo
 * desconhecido não atinge ninguém: aviso que toma a TV inteira só entra quando
 * o alvo é certo.
 */
export function alertReachesDevice(alert: AlertTarget, device: AlertDevice): boolean {
  switch (alert.targetMode) {
    case "all":
      return true;
    case "segments":
      return device.segmentId !== null && alert.segmentIds.includes(device.segmentId);
    case "companies":
      return alert.companyIds.includes(device.companyId);
    default:
      return false;
  }
}

/** No ar agora: depois do início, antes do fim (excluso) e não encerrado à mão. */
export function alertIsActive(alert: AlertWindow, now: Date): boolean {
  const at = now.getTime();
  return alert.endedAt === null && alert.startsAt.getTime() <= at && at < alert.endsAt.getTime();
}

export function alertStatus(alert: AlertWindow, now: Date): AlertStatus {
  if (alert.endedAt !== null) return "ended";
  return alertIsActive(alert, now) ? "active" : "expired";
}

/**
 * O aviso que toma esta TV agora: entre os ativos que a atingem, o mais
 * recente — quem publicou por último é quem sabe o que a tela deve dizer.
 */
export function activeAlertFor<T extends AlertTarget & AlertWindow & { id: number }>(
  alerts: T[],
  device: AlertDevice,
  now: Date,
): T | null {
  let chosen: T | null = null;
  for (const alert of alerts) {
    if (!alertIsActive(alert, now) || !alertReachesDevice(alert, device)) continue;
    const newer =
      chosen === null ||
      alert.createdAt.getTime() > chosen.createdAt.getTime() ||
      (alert.createdAt.getTime() === chosen.createdAt.getTime() && alert.id > chosen.id);
    if (newer) chosen = alert;
  }
  return chosen;
}

/** Peça do aviso na orientação da tela; nula se a arte foi apagada. */
export function alertPieceIdFor(
  alert: { landscapeAnnouncementId: number | null; portraitAnnouncementId: number | null },
  screen: "landscape" | "portrait",
): number | null {
  return screen === "portrait" ? alert.portraitAnnouncementId : alert.landscapeAnnouncementId;
}
