import { pgTable, serial, integer, unique } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { devicesTable } from "./devices";

export const campaignDevicesTable = pgTable(
  "campaign_devices",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
    deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  },
  (t) => [unique("campaign_device_unique").on(t.campaignId, t.deviceId)],
);