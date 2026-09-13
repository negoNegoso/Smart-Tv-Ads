import type { Request } from "express";
import { eq, asc, and, gte, lte, sql } from "drizzle-orm";
import {
  db,
  devicePlaylistTable,
  announcementsTable,
  campaignsTable,
  campaignAnnouncementsTable,
  advertisersTable,
} from "@workspace/db";
import { resolveSlideCaption } from "./slide-caption";
import { resolvePlaylistVideoIds } from "./youtube/playlist-resolver";
import { filterEligibleSlides } from "./ad-eligibility";
import { composeDeviceSlides, panelSlidesForClient } from "./panels/device-slides";

/** De onde o slide veio: campanha vendida, painel do lojista ou playlist do device. */
export type DeviceSlideSource = "campaign" | "panel" | "playlist";

export type FeedDevice = { id: number; clientId: number; segmentId: number | null };

function tagSource<R>(rows: R[], source: DeviceSlideSource): Array<R & { source: DeviceSlideSource }> {
  return rows.map((row) => ({ ...row, source }));
}

/**
 * A rotação que a TV exibe agora, na ordem de exibição, com a origem de cada
 * slide. Fonte única para a TV (/display/:deviceKey/slides) e para a prévia
 * do admin (/devices/:id/preview) — as duas não podem divergir no que vai ao
 * ar. Só lê: efeito colateral de TV (lastSeenAt) fica na rota da TV.
 */
export async function loadDeviceSlides(device: FeedDevice, log: Request["log"], now: Date = new Date()) {
  const playlistSlides = await db
    .select({
      announcementId: devicePlaylistTable.announcementId,
      campaignId: sql<number | null>`NULL`,
      title: announcementsTable.title,
      displayText: announcementsTable.displayText,
      showText: announcementsTable.showText,
      imageUrl: announcementsTable.imageUrl,
      duration: announcementsTable.duration,
      scanCode: sql<string | null>`NULL`,
      mediaKind: announcementsTable.mediaKind,
      youtubeId: announcementsTable.youtubeId,
      playbackMode: announcementsTable.playbackMode,
      audioMode: announcementsTable.audioMode,
      advertiserSegmentId: sql<number | null>`NULL`,
      advertiserClientId: sql<number | null>`NULL`,
      targetMode: sql<"all" | "devices" | "segments">`'all'`,
      deviceIds: sql<number[]>`array[]::int[]`,
      segmentIds: sql<number[]>`array[]::int[]`,
      weekdays: sql<number[]>`array[]::int[]`,
    })
    .from(devicePlaylistTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, devicePlaylistTable.announcementId))
    .where(
      and(
        eq(devicePlaylistTable.deviceId, device.id),
        eq(devicePlaylistTable.isActive, true)
      )
    )
    .orderBy(asc(devicePlaylistTable.displayOrder));

  const campaignSlides = await db
    .select({
      announcementId: campaignAnnouncementsTable.announcementId,
      campaignId: campaignsTable.id,
      title: announcementsTable.title,
      displayText: announcementsTable.displayText,
      showText: announcementsTable.showText,
      imageUrl: announcementsTable.imageUrl,
      duration: announcementsTable.duration,
      scanCode: sql<string | null>`CASE WHEN ${campaignAnnouncementsTable.destinationUrl} IS NULL THEN NULL ELSE ${campaignAnnouncementsTable.scanCode} END`,
      mediaKind: announcementsTable.mediaKind,
      youtubeId: announcementsTable.youtubeId,
      playbackMode: announcementsTable.playbackMode,
      audioMode: announcementsTable.audioMode,
      advertiserSegmentId: advertisersTable.segmentId,
      advertiserClientId: advertisersTable.clientId,
      targetMode: sql<"all" | "devices" | "segments">`${campaignsTable.targetMode}`,
      deviceIds: sql<number[]>`coalesce((select array_agg(cd.device_id) from campaign_devices cd where cd.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      segmentIds: sql<number[]>`coalesce((select array_agg(cs.segment_id) from campaign_segments cs where cs.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      weekdays: campaignsTable.weekdays,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(campaignAnnouncementsTable, eq(campaignAnnouncementsTable.campaignId, campaignsTable.id))
    .innerJoin(announcementsTable, eq(announcementsTable.id, campaignAnnouncementsTable.announcementId))
    .where(
      and(
        eq(campaignsTable.isActive, true),
        lte(campaignsTable.startsAt, now),
        gte(campaignsTable.endsAt, now),
      ),
    )
    .orderBy(asc(campaignsTable.id));

  // Alvo da campanha e regra de concorrência decidem juntos o que vai ao ar. A
  // playlist do próprio device fica de fora: é o lojista pondo o conteúdo dele.
  const eligibleCampaignSlides = filterEligibleSlides(campaignSlides, device, now);

  // Terceira fonte: painéis que o próprio lojista publicou no portal. Essa é
  // a fonte menos crítica das três — uma falha aqui (tabela ausente, lock,
  // linha inválida) nunca pode apagar campanhas pagas e a playlist do device
  // que já estavam prontas para ir ao ar, então cai para lista vazia.
  let panelSlides: Awaited<ReturnType<typeof panelSlidesForClient>> = [];
  try {
    panelSlides = await panelSlidesForClient(device.clientId);
  } catch (error) {
    log.error({ err: error }, "Could not load panel slides for device");
  }

  const deduped = composeDeviceSlides(
    tagSource(eligibleCampaignSlides, "campaign"),
    tagSource(panelSlides, "panel"),
    tagSource(playlistSlides, "playlist"),
  );

  return Promise.all(
    deduped.map(async ({
      scanCode,
      showText,
      displayText,
      advertiserSegmentId,
      advertiserClientId,
      targetMode,
      deviceIds,
      segmentIds,
      weekdays,
      ...slide
    }) => {
      const videoIds =
        slide.mediaKind === "youtube_playlist" && slide.youtubeId
          ? await resolvePlaylistVideoIds(slide.youtubeId)
          : null;
      return {
        ...slide,
        // O servidor decide o texto: null significa slide sem legenda, para os
        // dois renderizadores (display.tsx e tv.html) não divergirem na regra.
        displayText: resolveSlideCaption({ showText, displayText }),
        qrImageUrl: scanCode ? `/api/qr/${scanCode}.png` : null,
        videoIds,
      };
    }),
  );
}
