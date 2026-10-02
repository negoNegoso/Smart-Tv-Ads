import { pgTable, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

/**
 * Um período contínuo em que a TV falou com o servidor. A TV busca o feed a
 * cada 60 s; enquanto os contatos chegam dentro da janela de presença, a mesma
 * linha é esticada. O buraco entre duas linhas seguidas da mesma TV é uma
 * queda — é disso que sai a linha do tempo do admin.
 */
export const deviceSessionsTable = pgTable(
  "device_sessions",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  // As três consultas (esticar, limpar, listar) filtram por TV e por
  // last_seen_at; sem o índice, cada feed varreria o histórico inteiro.
  (t) => [index("device_sessions_device_last_seen_idx").on(t.deviceId, t.lastSeenAt)],
);

export type DeviceSession = typeof deviceSessionsTable.$inferSelect;
