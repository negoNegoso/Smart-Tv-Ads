// lib/db/src/schema/user_advertisers.ts
import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { advertisersTable } from "./advertisers";

export const userAdvertisersTable = pgTable(
  "user_advertisers",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    advertiserId: integer("advertiser_id")
      .notNull()
      .references(() => advertisersTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.advertiserId] })],
);

export type UserAdvertiser = typeof userAdvertisersTable.$inferSelect;
