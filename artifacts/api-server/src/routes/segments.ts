import { Router, type IRouter } from "express";
import {
  ListSegmentsResponse,
  CreateSegmentBody,
  CreateSegmentResponse,
  RenameSegmentBody,
  RenameSegmentResponse,
  MergeSegmentBody,
  MergeSegmentResponse,
} from "@workspace/api-zod";
import { toSegmentSlug } from "../lib/segment-slug";
import {
  SegmentSlugConflictError,
  createSegment,
  deleteSegmentIfUnused,
  findSegmentBySlug,
  getSegmentWithUsage,
  listSegmentsWithUsage,
  mergeSegments,
  renameSegment,
  type SegmentUsage,
} from "../lib/segments/store";

const router: IRouter = Router();

const NOT_FOUND = "Segmento não encontrado.";

function idParam(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function usageMessage(usage: SegmentUsage): string {
  return `Usado por ${plural(usage.companyCount, "empresa", "empresas")} e ${plural(usage.campaignCount, "campanha", "campanhas")}`;
}

/** Nome aparado e slug; slug vazio é nome sem letra nem número. */
function nameAndSlug(raw: string): { name: string; slug: string } | null {
  const name = raw.trim();
  const slug = toSegmentSlug(name);
  return slug ? { name, slug } : null;
}

router.get("/segments", async (_req, res): Promise<void> => {
  res.json(ListSegmentsResponse.parse(await listSegmentsWithUsage()));
});

router.post("/segments", async (req, res): Promise<void> => {
  const parsed = CreateSegmentBody.safeParse(req.body);
  const input = parsed.success ? nameAndSlug(parsed.data.name) : null;
  if (!input) {
    res.status(400).json({ error: "Nome de segmento inválido" });
    return;
  }
  if (await findSegmentBySlug(input.slug)) {
    res.status(409).json({ error: "Segmento já cadastrado" });
    return;
  }
  try {
    res.status(201).json(CreateSegmentResponse.parse(await createSegment(input.name, input.slug)));
  } catch (err) {
    if (err instanceof SegmentSlugConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.patch("/segments/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const parsed = RenameSegmentBody.safeParse(req.body);
  const input = parsed.success ? nameAndSlug(parsed.data.name) : null;
  if (!input) {
    res.status(400).json({ error: "Nome de segmento inválido" });
    return;
  }
  if (!id || !(await getSegmentWithUsage(id))) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  // Mesmo slug do próprio segmento é só ajuste de caixa ou acento. Slug de
  // outro segmento é o mesmo ramo: o caminho é mesclar, não ter dois.
  const clash = await findSegmentBySlug(input.slug);
  if (clash && clash.id !== id) {
    res.status(409).json({ error: `Já existe o segmento ${clash.name} — use mesclar` });
    return;
  }
  try {
    res.json(RenameSegmentResponse.parse(await renameSegment(id, input.name, input.slug)));
  } catch (err) {
    if (err instanceof SegmentSlugConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete("/segments/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const result = id ? await deleteSegmentIfUnused(id) : ({ status: "not_found" } as const);
  if (result.status === "not_found") {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  if (result.status === "in_use") {
    res.status(409).json({ error: usageMessage(result.usage), ...result.usage });
    return;
  }
  res.sendStatus(204);
});

router.post("/segments/:id/merge", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const parsed = MergeSegmentBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: "Escolha o segmento de destino" });
    return;
  }
  if (parsed.data.targetId === id) {
    res.status(400).json({ error: "Escolha outro segmento como destino" });
    return;
  }
  const result = await mergeSegments(id, parsed.data.targetId);
  if (result.status === "not_found") {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  res.json(MergeSegmentResponse.parse(result.target));
});

export default router;
