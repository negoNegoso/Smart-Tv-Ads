import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { nextDayKey } from "../admin-overview/availability";
import { businessDayKey } from "./period";

export type CampaignStatus = "agendada" | "no_ar" | "encerrada";

export interface CampaignWindow {
  status: CampaignStatus;
  from: Date;
  to: Date;
  /** Um `YYYY-MM-DD` local por dia do contrato até agora; vazio se agendada. */
  keys: string[];
}

/**
 * A janela que o comprovante cobre: o contrato inteiro, do início até o fim —
 * ou até agora, se a campanha ainda está no ar.
 *
 * O último dia é o do instante anterior ao fim: uma campanha que termina à
 * meia-noite local termina no dia anterior, e não ganha um dia vazio a mais.
 */
export function campaignWindow(
  startsAt: Date,
  endsAt: Date,
  now: Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): CampaignWindow {
  if (now < startsAt) return { status: "agendada", from: startsAt, to: startsAt, keys: [] };

  const running = now < endsAt;
  const to = running ? now : endsAt;
  const firstKey = businessDayKey(startsAt, timeZone);
  const lastInstant = new Date(Math.max(startsAt.getTime(), to.getTime() - 1));
  const lastKey = businessDayKey(lastInstant, timeZone);

  const keys: string[] = [];
  for (let key = firstKey; key <= lastKey; key = nextDayKey(key)) keys.push(key);

  return { status: running ? "no_ar" : "encerrada", from: startsAt, to, keys };
}
