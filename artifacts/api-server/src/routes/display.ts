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
} from "@workspace/db";
import { GetDeviceSlidesResponse } from "@workspace/api-zod";
import { resolveSlideCaption } from "../lib/slide-caption";

const router: IRouter = Router();

router.get("/display/:deviceKey/slides", async (req, res): Promise<void> => {
  const { deviceKey } = req.params;
  const raw = Array.isArray(deviceKey) ? deviceKey[0] : deviceKey;

  const [device] = await db
    .select()
    .from(devicesTable)
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
    })
    .from(campaignsTable)
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

  const seen = new Set<number>();
  const slides = [...campaignSlides, ...playlistSlides]
    .filter((slide) => {
      if (seen.has(slide.announcementId)) return false;
      seen.add(slide.announcementId);
      return true;
    })
    .map(({ scanCode, showText, displayText, ...slide }) => ({
      ...slide,
      // O servidor decide o texto: null significa slide sem legenda, para os
      // dois renderizadores (display.tsx e tv.html) não divergirem na regra.
      displayText: resolveSlideCaption({ showText, displayText }),
      qrImageUrl: scanCode ? `/api/qr/${scanCode}.png` : null,
    }));

  res.json(GetDeviceSlidesResponse.parse(slides));
});

export default router;
