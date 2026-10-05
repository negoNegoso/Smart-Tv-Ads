import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, segmentsTable, companiesTable, campaignSegmentsTable } from "@workspace/db";
import { isUniqueViolation } from "../pg-errors";

export type SegmentRow = { id: number; slug: string; name: string };
export type SegmentUsage = { companyCount: number; campaignCount: number };
export type SegmentWithUsage = SegmentRow & SegmentUsage;

/** Corrida gravando dois segmentos com o mesmo slug: o UNIQUE barra. */
export class SegmentSlugConflictError extends Error {}

const baseColumns = { id: segmentsTable.id, slug: segmentsTable.slug, name: segmentsTable.name };

// Quantas empresas e campanhas dependem do segmento: é o que decide se ele
// pode ser apagado e o que a tela mostra antes de mesclar.
// Os identificadores vão qualificados à mão: em select de tabela única o
// drizzle tira o prefixo da tabela (`"id"` solto), e o Postgres resolveria
// esse nome para a tabela de dentro da subconsulta, errando a contagem.
const segmentId = sql`${sql.identifier("segments")}.${sql.identifier("id")}`;
export const segmentUsageColumns = {
  companyCount: sql<number>`(select count(*)::int from ${companiesTable} where ${sql.identifier("companies")}.${sql.identifier("segment_id")} = ${segmentId})`,
  campaignCount: sql<number>`(select count(*)::int from ${campaignSegmentsTable} where ${sql.identifier("campaign_segments")}.${sql.identifier("segment_id")} = ${segmentId})`,
};

export async function listSegmentsWithUsage(): Promise<SegmentWithUsage[]> {
  return db.select({ ...baseColumns, ...segmentUsageColumns }).from(segmentsTable).orderBy(asc(segmentsTable.name));
}

export async function getSegmentWithUsage(id: number): Promise<SegmentWithUsage | null> {
  const [row] = await db.select({ ...baseColumns, ...segmentUsageColumns }).from(segmentsTable).where(eq(segmentsTable.id, id));
  return row ?? null;
}

export async function findSegmentBySlug(slug: string): Promise<SegmentRow | null> {
  const [row] = await db.select(baseColumns).from(segmentsTable).where(eq(segmentsTable.slug, slug));
  return row ?? null;
}

function rethrowSlugConflict(err: unknown): never {
  if (isUniqueViolation(err)) throw new SegmentSlugConflictError("Segmento já cadastrado");
  throw err;
}

export async function createSegment(name: string, slug: string): Promise<SegmentRow> {
  const [row] = await db.insert(segmentsTable).values({ name, slug }).returning(baseColumns).catch(rethrowSlugConflict);
  return row;
}

export async function renameSegment(id: number, name: string, slug: string): Promise<SegmentRow> {
  const [row] = await db
    .update(segmentsTable)
    .set({ name, slug })
    .where(eq(segmentsTable.id, id))
    .returning(baseColumns)
    .catch(rethrowSlugConflict);
  return row;
}

export type DeleteSegmentResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "in_use"; usage: SegmentUsage };

/**
 * Apaga só segmento que ninguém usa. O FOR UPDATE vem antes da contagem:
 * quem está gravando empresa ou campanha apontando para o segmento segura um
 * KEY SHARE na linha (efeito da FK), então a trava espera essa gravação
 * terminar e a contagem seguinte já a enxerga. Sem isso a contagem podia dar
 * zero e o `on delete set null` tirar o segmento da empresa recém-gravada —
 * exatamente o furo na regra do concorrente que esta tela fecha.
 */
export async function deleteSegmentIfUnused(id: number): Promise<DeleteSegmentResult> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: segmentsTable.id }).from(segmentsTable).where(eq(segmentsTable.id, id)).for("update");
    if (!locked) return { status: "not_found" } as const;
    const [usage] = await tx.select(segmentUsageColumns).from(segmentsTable).where(eq(segmentsTable.id, id));
    if (usage.companyCount > 0 || usage.campaignCount > 0) return { status: "in_use", usage } as const;
    await tx.delete(segmentsTable).where(eq(segmentsTable.id, id));
    return { status: "deleted" } as const;
  });
}

export type MergeSegmentResult = { status: "merged"; target: SegmentWithUsage } | { status: "not_found" };

/**
 * Junta a origem no destino: empresas e alvos de campanha passam para o
 * destino e a origem some. Tudo numa transação, com as duas linhas travadas
 * (mesmo motivo do apagar). Quem mirava os dois segmentos não ganha linha
 * duplicada: `on conflict do nothing` respeita o único (campanha, segmento),
 * e o cascade ao apagar a origem limpa o que sobrou dela.
 */
export async function mergeSegments(sourceId: number, targetId: number): Promise<MergeSegmentResult> {
  const merged = await db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: segmentsTable.id })
      .from(segmentsTable)
      .where(inArray(segmentsTable.id, [sourceId, targetId]))
      .for("update");
    if (locked.length !== 2) return false;
    await tx.update(companiesTable).set({ segmentId: targetId }).where(eq(companiesTable.segmentId, sourceId));
    await tx.execute(sql`insert into ${campaignSegmentsTable} (campaign_id, segment_id)
      select campaign_id, ${targetId} from ${campaignSegmentsTable} where segment_id = ${sourceId}
      on conflict do nothing`);
    await tx.delete(segmentsTable).where(eq(segmentsTable.id, sourceId));
    return true;
  });
  if (!merged) return { status: "not_found" };
  return { status: "merged", target: (await getSegmentWithUsage(targetId))! };
}
