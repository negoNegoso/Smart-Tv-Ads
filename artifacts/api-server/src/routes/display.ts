import { Router, type IRouter } from "express";
import { eq, asc, and, or, gte, lte, sql } from "drizzle-orm";
import {
  db,
  devicesTable,
  devicePlaylistTable,
  announcementsTable,
  campaignsTable,
  campaignDevicesTable,
  campaignAnnouncementsTable,
  advertisersTable,
  clientsTable,
} from "@workspace/db";
import { GetDeviceSlidesResponse } from "@workspace/api-zod";
import { resolveSlideCaption } from "../lib/slide-caption";
import { resolvePlaylistVideoIds } from "../lib/youtube/playlist-resolver";
import { filterEligibleSlides } from "../lib/ad-eligibility";

const router: IRouter = Router();

router.get("/display/:deviceKey/slides", async (req, res): Promise<void> => {
  const { deviceKey } = req.params;
  const raw = Array.isArray(deviceKey) ? deviceKey[0] : deviceKey;

  const [device] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      segmentId: clientsTable.segmentId,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .where(eq(devicesTable.deviceKey, raw));

  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  // Update lastSeenAt
  await db
    .update(devicesTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(devicesTable.id, device.id));

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

  const now = new Date();
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
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(campaignAnnouncementsTable, eq(campaignAnnouncementsTable.campaignId, campaignsTable.id))
    .innerJoin(announcementsTable, eq(announcementsTable.id, campaignAnnouncementsTable.announcementId))
    .leftJoin(campaignDevicesTable, eq(campaignDevicesTable.campaignId, campaignsTable.id))
    .where(
      and(
        eq(campaignsTable.isActive, true),
        lte(campaignsTable.startsAt, now),
        gte(campaignsTable.endsAt, now),
        or(eq(campaignsTable.allDevices, true), eq(campaignDevicesTable.deviceId, device.id)),
      ),
    )
    .orderBy(asc(campaignsTable.id));

  // Peça de anunciante concorrente do dono da TV não entra na grade. A playlist
  // do próprio device fica de fora da regra: é o lojista pondo o conteúdo dele.
  const eligibleCampaignSlides = filterEligibleSlides(campaignSlides, {
    clientId: device.clientId,
    segmentId: device.segmentId,
  });

  const seen = new Set<number>();
  const deduped = [...eligibleCampaignSlides, ...playlistSlides].filter((slide) => {
    if (seen.has(slide.announcementId)) return false;
    seen.add(slide.announcementId);
    return true;
  });

  const slides = await Promise.all(
    deduped.map(async ({ scanCode, showText, displayText, advertiserSegmentId, advertiserClientId, ...slide }) => {
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

  res.json(GetDeviceSlidesResponse.parse(slides));
});

export default router;
