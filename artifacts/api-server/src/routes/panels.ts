// artifacts/api-server/src/routes/panels.ts
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
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
import { PanelRenderError, publishPanel, unpublishPanel } from "../lib/panels/publish";
import { sniffImageMimeType } from "../lib/image-sniff";
import { mediaStore } from "../lib/storage";
import { maxUploadBytes, uploadTooLargeMessage } from "../lib/upload-limit";

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

/**
 * Erro do fileFilter do multer para upload que não declara ser imagem. Uma
 * classe dedicada deixa uploadImage reconhecer a recusa por identidade, sem
 * comparar mensagem de erro.
 */
class NotAnImageError extends Error {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes() },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new NotAnImageError("Envie um arquivo de imagem."));
      return;
    }
    cb(null, true);
  },
});

/** Traduz os erros do multer em resposta HTTP, como em announcements.ts. */
function uploadImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (err: unknown) => {
    if (err instanceof NotAnImageError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: uploadTooLargeMessage(maxUploadBytes()) });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

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
    // Todo painel devolvido pela API carrega `items`, mesmo vazio: um
    // consumidor nunca deveria precisar saber qual rota devolveu o objeto
    // para decidir se o campo existe.
    res.status(201).json({ ...panel, items: [] });
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
  const updated = await updatePanel(res.locals.panelId as number, parsed.data);
  if (!updated) {
    // O painel sumiu entre o guard de requirePanelAccess e este update
    // (corrida com outra requisição apagando o mesmo painel). 404 é a
    // resposta correta: o pedido era válido, o recurso não existe mais.
    res.status(404).json({ error: "Painel não encontrado." });
    return;
  }
  // Busca de novo com os itens: quem chama o PATCH quer o painel inteiro,
  // igual ao que GET /panels/:id devolveria, não só as colunas que mudaram.
  const panel = await getPanel(updated.id);
  if (!panel) {
    // Mesma corrida acima, só que entre o update e esta leitura. Também
    // vira 404 em vez de mandar um corpo sem `items`.
    res.status(404).json({ error: "Painel não encontrado." });
    return;
  }
  res.json(panel);
});

router.put("/client/panels/:id/items", requirePanelAccess, async (req, res) => {
  const parsed = itemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Lista de itens inválida." });
    return;
  }
  res.json(await replaceItems(res.locals.panelId as number, parsed.data.items));
});

router.post("/client/panels/:id/publish", requirePanelAccess, async (_req, res) => {
  try {
    const result = await publishPanel(res.locals.panelId as number);
    res.json({ status: "published", pages: result.pages });
  } catch (error) {
    if (error instanceof PanelRenderError) {
      // 422: o pedido é válido, o conteúdo é que não virou imagem. A
      // publicação anterior continua no ar.
      res.status(422).json({ error: error.message, pageNo: error.pageNo });
      return;
    }
    throw error;
  }
});

router.post("/client/panels/:id/unpublish", requirePanelAccess, async (_req, res) => {
  await unpublishPanel(res.locals.panelId as number);
  res.json({ status: "draft" });
});

router.delete("/client/panels/:id", requirePanelAccess, async (_req, res) => {
  const id = res.locals.panelId as number;
  // As imagens precisam sair do storage; o cascade só apaga as linhas.
  await unpublishPanel(id);
  await deletePanel(id);
  res.status(204).end();
});

router.post("/client/panels/:id/image", requirePanelAccess, uploadImage, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhuma imagem enviada." });
    return;
  }
  // O fileFilter do multer só olha o Content-Type que o cliente declarou —
  // texto livre que pode mentir. Antes de gravar, confirma pelos bytes de
  // verdade e usa o tipo sniffado (não o declarado) no storage: assim um
  // LocalDiskStore/ReplitObjectStore nunca serve de volta um HTML/SVG com
  // script disfarçado de imagem a partir da própria origem do app.
  const mimeType = sniffImageMimeType(req.file.buffer);
  if (!mimeType) {
    res.status(400).json({ error: "Envie um arquivo de imagem." });
    return;
  }
  const imageUrl = await mediaStore().put(req.file.buffer, mimeType, req.file.originalname);
  res.status(201).json({ imageUrl });
});

export default router;
export { requirePanelAccess, authOf };
