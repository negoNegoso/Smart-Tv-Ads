import { pgTable, serial, integer, unique } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { advertisersTable } from "./advertisers";

export const campaignAdvertisersTable = pgTable(
  "campaign_advertisers",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
    advertiserId: integer("advertiser_id").notNull().references(() => advertisersTable.id, { onDelete: "cascade" }),
  },
  (t) => [unique("campaign_advertiser_unique").on(t.campaignId, t.advertiserId)],
);