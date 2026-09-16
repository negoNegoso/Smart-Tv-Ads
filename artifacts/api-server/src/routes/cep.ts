import { Router, type IRouter } from "express";
import { CepInvalidError, CepNotFoundError, CepUnavailableError, lookupCep } from "../lib/cep";

const router: IRouter = Router();

router.get("/cep/:cep", async (req, res): Promise<void> => {
  try {
    res.json(await lookupCep(String(req.params.cep)));
  } catch (err) {
    if (err instanceof CepInvalidError) {
      res.status(400).json({ error: "CEP deve ter 8 dígitos." });
      return;
    }
    if (err instanceof CepNotFoundError) {
      res.status(404).json({ error: "CEP não encontrado. Preencha o endereço manualmente." });
      return;
    }
    if (err instanceof CepUnavailableError) {
      res.status(502).json({ error: "Serviço de CEP indisponível. Preencha o endereço manualmente." });
      return;
    }
    throw err;
  }
});

export default router;
