import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import { formatClock } from "../lib/editorial/clock";
import { fetchForecast } from "../lib/editorial/forecast";
import { renderWeather } from "../lib/editorial/render";

const router: IRouter = Router();

/**
 * Slide de clima e hora da loja. Pública como o feed: a TV pede a imagem sem
 * sessão. O `m` (minuto) da URL não é lido aqui — só muda o endereço a cada
 * minuto para a CDN e o navegador da TV pegarem a hora nova.
 */
router.get("/editorial/weather.png", async (req, res): Promise<void> => {
  const companyId = Number(req.query.company);
  const orientation = req.query.o === "portrait" ? "portrait" : "landscape";
  if (!Number.isInteger(companyId) || companyId <= 0) {
    res.status(404).json({ error: "Empresa não encontrada." });
    return;
  }
  const [company] = await db
    .select({
      name: companiesTable.name,
      city: companiesTable.city,
      lat: companiesTable.lat,
      lng: companiesTable.lng,
      // Rota pública com id sequencial: só quem tem TV real com o clima ligado
      // responde, senão qualquer um listaria a cidade e o nome de todas as lojas.
      // A empresa vai com a tabela escrita: em select de uma tabela só o
      // drizzle tira o prefixo de ${companiesTable.id}, e o "id" solto fica
      // ambíguo entre devices e clients dentro do exists.
      usesWeather: sql<boolean>`exists (select 1 from devices d join clients c on c.id = d.client_id where c.company_id = ${sql.identifier("companies")}.${sql.identifier("id")} and d.show_weather and not d.showcase)`,
    })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));
  if (!company || !company.usesWeather || company.lat == null || company.lng == null) {
    res.status(404).json({ error: "Empresa sem localização." });
    return;
  }

  // Sem previsão a arte sai só com o relógio: a TV nunca perde o slide.
  const forecast = await fetchForecast(company.lat, company.lng);
  try {
    const png = await renderWeather(
      { city: company.city ?? company.name, clock: formatClock(new Date()), forecast },
      orientation,
    );
    res.set("Cache-Control", "public, s-maxage=60, max-age=60");
    res.type("png").send(png);
  } catch (err) {
    req.log.error({ err }, "Falha ao desenhar o slide de clima");
    res.status(500).json({ error: "Não foi possível gerar o clima." });
  }
});

export default router;
