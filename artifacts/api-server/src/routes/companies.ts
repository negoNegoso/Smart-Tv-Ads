import { Router, type IRouter } from "express";
import { createCompanyInput, updateCompanyInput } from "../lib/companies/input";
import { deleteBlock, planRoles } from "../lib/companies/roles";
import {
  CompanyConflictError,
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  updateCompany,
} from "../lib/companies/store";

const router: IRouter = Router();

function idParam(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/companies", async (req, res): Promise<void> => {
  const role = req.query.role === "client" || req.query.role === "advertiser" ? req.query.role : undefined;
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
  const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
  res.json(await listCompanies({ status, role, q }));
});

router.post("/companies", async (req, res): Promise<void> => {
  const parsed = createCompanyInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    return;
  }
  try {
    res.status(201).json(await createCompany(parsed.data));
  } catch (err) {
    if (err instanceof CompanyConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.get("/companies/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const company = id ? await getCompany(id) : null;
  if (!company) {
    res.status(404).json({ error: "Empresa não encontrada." });
    return;
  }
  res.json(company);
});

router.patch("/companies/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const parsed = updateCompanyInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    return;
  }
  const current = id ? await getCompany(id) : null;
  if (!id || !current) {
    res.status(404).json({ error: "Empresa não encontrada." });
    return;
  }
  const { isClient, isAdvertiser, advertiserCompany, ...fields } = parsed.data;
  const decision = planRoles(current, { isClient, isAdvertiser }, current.dependencies);
  if (!decision.ok) {
    res.status(decision.status).json({ error: decision.error, dependencies: decision.dependencies });
    return;
  }
  try {
    res.json(await updateCompany(id, fields, decision.plan, advertiserCompany));
  } catch (err) {
    if (err instanceof CompanyConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete("/companies/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const current = id ? await getCompany(id) : null;
  if (!id || !current) {
    res.status(404).json({ error: "Empresa não encontrada." });
    return;
  }
  const block = deleteBlock(current.dependencies);
  if (block) {
    res.status(409).json({ error: block, dependencies: current.dependencies });
    return;
  }
  await deleteCompany(id);
  res.sendStatus(204);
});

export default router;
