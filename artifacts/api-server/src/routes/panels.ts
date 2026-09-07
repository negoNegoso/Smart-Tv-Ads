// artifacts/api-server/src/routes/panels.ts
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod/v4";
import { requireClient } from "../lib/auth/middleware";
import { canAccessPanel, resolveOwnerClientId, type PanelAuth } from "../lib/panels/ownership";
import {
  createPanel,
  deletePanel,
  getPanel,
  listPanels,
  panelClientId,
  replaceItems,
  updatePanel,
} from "../lib/panels/queries";

const router: IRouter = Router();

const authOf = (req: Request): PanelAuth => ({
  isAdmin: req.auth?.isAdmin ?? false,
  clientIds: req.auth?.clientIds ?? [],
});

const createBody = z.object({
  kind: z.enum(["menu", "promo", "notice"]),
  name: z.string().trim().min(1).max(80),
  template: z.string().trim().min(1).max(40),
  clientId: z.number().int().positive().optional(),
});

const patchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  template: z.string().trim().min(1).max(40).optional(),
  duration: z.number().int().min(5).max(60).optional(),
  headline: z.string().trim().max(80).nullable().optional(),
  body: z.string().trim().max(300).nullable().optional(),
});

const itemsBody = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(200).nullable().default(null),
        // Centavos: inteiro não negativo. Item de cortesia vale 0.
        priceCents: z.number().int().min(0).max(100_000_000),
        oldPriceCents: z.number().int().min(0).max(100_000_000).nullable().default(null),
        category: z.string().trim().max(60).nullable().default(null),
        imageUrl: z.string().trim().max(500).nullable().default(null),
      }),
    )
    .max(200),
});

/** Código do Postgres para violação de chave estrangeira. */
const FK_VIOLATION = "23503";

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === FK_VIOLATION;
}

/**
 * Carrega o painel do path e autoriza. Sem isto, trocar o id na URL alcança o
 * cardápio de outro cliente. Painel inexistente é 404 — 403 aqui contaria a
 * quem tentou que o id existe.
 */
async function requirePanelAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Identificador inválido." });
    return;
  }
  const clientId = await panelClientId(id);
  if (clientId === null) {
    res.status(404).json({ error: "Painel não encontrado." });
    return;
  }
  if (!canAccessPanel(authOf(req), clientId)) {
    res.status(403).json({ error: "Sem permissão." });
    return;
  }
  res.locals.panelId = id;
  next();
}

router.use("/client/panels", requireClient);

router.get("/client/panels", async (req, res) => {
  const auth = authOf(req);
  // Admin sem vínculo usa o painel de gestão; aqui a lista sai vazia.
  res.json(await listPanels(auth.clientIds));
});

router.post("/client/panels", async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos para criar o painel." });
    return;
  }
  const clientId = resolveOwnerClientId(authOf(req), parsed.data.clientId);
  if (clientId === null) {
    res.status(400).json({ error: "Informe a qual cliente o painel pertence." });
    return;
  }
  try {
    const panel = await createPanel({
      clientId,
      kind: parsed.data.kind,
      name: parsed.data.name,
      template: parsed.data.template,
    });
    res.status(201).json(panel);
  } catch (err) {
    // Só um admin alcança isto: um usuário de cliente só resolve para um
    // clientId ao qual está vinculado. Ainda assim, um id inexistente vindo
    // do Postgres como violação de FK não pode virar 500.
    if (isForeignKeyViolation(err)) {
      res.status(400).json({ error: "O cliente informado não existe." });
      return;
    }
    throw err;
  }
});

router.get("/client/panels/:id", requirePanelAccess, async (_req, res) => {
  res.json(await getPanel(res.locals.panelId as number));
});

router.patch("/client/panels/:id", requirePanelAccess, async (req, res) => {
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos para atualizar o painel." });
    return;
  }
  res.json(await updatePanel(res.locals.panelId as number, parsed.data));
});

router.put("/client/panels/:id/items", requirePanelAccess, async (req, res) => {
  const parsed = itemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Lista de itens inválida." });
    return;
  }
  res.json(await replaceItems(res.locals.panelId as number, parsed.data.items));
});

router.delete("/client/panels/:id", requirePanelAccess, async (_req, res) => {
  await deletePanel(res.locals.panelId as number);
  res.status(204).end();
});

export default router;
export { requirePanelAccess, authOf };
