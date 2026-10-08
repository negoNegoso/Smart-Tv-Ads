import type { Request } from "express";
import { screenOrientationOf } from "@workspace/db/orientation";
import { buildCampaignSlidesQuery, loadPlaylistSlides, type FeedDevice } from "./device-feed";
import { filterReachableSlides } from "./ad-eligibility";
import { composeDeviceLoop, panelSlidesForClient, type LoopSlide } from "./panels/device-slides";
import { filterByOrientation } from "./slide-orientation";
import { findActiveAlertPiece } from "./alerts/active-alert";
import { resolveSlideCaption } from "./slide-caption";

/**
 * Lista que a TV guarda para tocar sem internet. Diferente do feed online,
 * leva campanhas fora do dia/horário de agora (e as que começam em até 7
 * dias) com a agenda delas: a TV sem rede confere sozinha o que pode tocar.
 * Alvo e concorrência já saem filtrados aqui, porque não mudam com o tempo.
 */
export const OFFLINE_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

// YouTube precisa de internet; a TV pularia o slide de qualquer jeito.
const SO_COM_INTERNET = new Set(["youtube_video", "youtube_playlist"]);

export type OfflineAgenda = {
  inicio?: string;
  fim: string;
  dias?: number[];
  faixas?: Array<{ start: number; end: number }>;
};

export type OfflineSlide = {
  announcementId: number;
  campaignId: number | null;
  title: string;
  displayText: string | null;
  imageUrl: string | null;
  duration: number;
  qrImageUrl: string | null;
  mediaKind: string;
  youtubeId: null;
  playbackMode: string | null;
  audioMode: string | null;
  videoIds: null;
  agenda?: OfflineAgenda;
};

export type OfflineFeed = { geradoEm: string; slides: OfflineSlide[] };

/** Linha das três fontes, no que a lista sem internet usa. */
type SourceRow = {
  announcementId: number;
  campaignId: number | null;
  title: string;
  displayText: string | null;
  showText: boolean | null;
  imageUrl: string | null;
  duration: number;
  scanCode: string | null;
  mediaKind: string;
  playbackMode: string | null;
  audioMode: string | null;
  panelId?: number | null;
  loopInsertions?: number;
  weekdays?: number[];
  timeWindows?: Array<{ start: number; end: number }> | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

type LoopRow = LoopSlide & { slide: OfflineSlide };

function toLoopRow(row: SourceRow): LoopRow {
  const slide: OfflineSlide = {
    announcementId: row.announcementId,
    campaignId: row.campaignId,
    title: row.title,
    displayText: resolveSlideCaption({ showText: row.showText ?? false, displayText: row.displayText }),
    imageUrl: row.imageUrl,
    duration: row.duration,
    qrImageUrl: row.scanCode ? `/api/qr/${row.scanCode}.png` : null,
    mediaKind: row.mediaKind,
    youtubeId: null,
    playbackMode: row.playbackMode,
    audioMode: row.audioMode,
    videoIds: null,
  };
  // Só campanha tem agenda: painel e playlist são do próprio lojista e tocam sempre.
  if (row.campaignId !== null && row.startsAt && row.endsAt) {
    slide.agenda = {
      inicio: row.startsAt.toISOString(),
      fim: row.endsAt.toISOString(),
      dias: row.weekdays ?? [],
      faixas: row.timeWindows ?? [],
    };
  }
  return {
    announcementId: row.announcementId,
    campaignId: row.campaignId,
    panelId: row.panelId ?? null,
    loopInsertions: row.loopInsertions,
    slide,
  };
}

export async function loadOfflineFeed(
  device: FeedDevice,
  log: Request["log"],
  now: Date = new Date(),
): Promise<OfflineFeed | null> {
  // A vitrine é espelho da landing: fica de fora (decidido na spec).
  if (device.showcase) return null;
  try {
    const screen = screenOrientationOf(device.orientation);
    const playlist = await loadPlaylistSlides(device.id);
    const campaigns = await buildCampaignSlidesQuery(now, new Date(now.getTime() + OFFLINE_HORIZON_MS));

    // Mesma tolerância do feed online: painel quebrado não apaga o resto.
    let panels: Awaited<ReturnType<typeof panelSlidesForClient>> = [];
    try {
      panels = await panelSlidesForClient(device.clientId);
    } catch (error) {
      log.error({ err: error }, "Could not load panel slides for offline feed");
    }

    const prontos = <T extends SourceRow & { orientation: string | null }>(rows: T[]) =>
      filterByOrientation(rows, screen)
        .filter((row) => !SO_COM_INTERNET.has(row.mediaKind))
        .map(toLoopRow);

    const slides = composeDeviceLoop(
      prontos(filterReachableSlides(campaigns, device)),
      prontos(panels),
      prontos(playlist),
    ).map((row) => row.slide);

    // Aviso na frente, sem substituir a volta: se ele vencer com a TV sem
    // rede, ela volta sozinha para a programação.
    try {
      const alert = await findActiveAlertPiece(device, screen, now);
      if (alert) {
        slides.unshift({
          announcementId: alert.announcementId,
          campaignId: null,
          title: alert.title,
          displayText: null,
          imageUrl: alert.imageUrl,
          duration: alert.duration,
          qrImageUrl: null,
          mediaKind: "image",
          youtubeId: null,
          playbackMode: "capped",
          audioMode: "muted",
          videoIds: null,
          agenda: { fim: alert.endsAt.toISOString() },
        });
      }
    } catch (error) {
      log.error({ err: error }, "Could not load urgent alert for offline feed");
    }

    return { geradoEm: now.toISOString(), slides };
  } catch (error) {
    log.error({ err: error }, "Could not build offline feed");
    return null;
  }
}
