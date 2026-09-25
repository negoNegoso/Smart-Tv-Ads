import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A disciplina de ordenação de publishPanel é o ponto inteiro desta task:
 * tudo renderiza e sobe ao MediaStore ANTES de a transação abrir; se o
 * render falhar, zero chamada de transação e só o que já subiu é limpo; a
 * remoção das imagens antigas só acontece DEPOIS que a transação resolve
 * (porque apagar arquivo não participa de rollback). publish-plan.test.ts
 * cobre `panelPages` (função pura) mockando @workspace/db como stub inerte
 * — isso nunca exercitou `publishPanel` de verdade. Este arquivo cobre
 * `publishPanel` com um `db.transaction` e um MediaStore falsos que
 * registram um log de chamadas ordenado, sem banco e sem rede.
 */

const panelsTable = { __name: "panels" };
const panelSlidesTable = { __name: "panel_slides" };
const announcementsTable = { __name: "announcements" };
const campaignAnnouncementsTable = { __name: "campaign_announcements" };

const dbTransaction = vi.fn();
vi.mock("@workspace/db", () => ({
  db: { transaction: (...a: unknown[]) => dbTransaction(...a) },
  panelsTable,
  panelSlidesTable,
  announcementsTable,
  campaignAnnouncementsTable,
}));

const getPanel = vi.fn();
vi.mock("../queries", () => ({ getPanel: (...a: unknown[]) => getPanel(...a) }));

const loadFlyerContext = vi.fn();
vi.mock("../flyer-context", async (orig) => ({
  ...(await orig<typeof import("../flyer-context")>()),
  loadFlyerContext: (...a: unknown[]) => loadFlyerContext(...a),
}));

const renderPanelPage = vi.fn();
const renderFlyerPage = vi.fn();
vi.mock("../render", () => ({
  renderPanelPage: (...a: unknown[]) => renderPanelPage(...a),
  renderFlyerPage: (...a: unknown[]) => renderFlyerPage(...a),
}));

const fetchImageDataUri = vi.fn();
vi.mock("../promo-image", () => ({ fetchImageDataUri: (...a: unknown[]) => fetchImageDataUri(...a) }));

const storePut = vi.fn();
const storeRemove = vi.fn();
const storeGet = vi.fn();
vi.mock("../../storage", () => ({
  mediaStore: () => ({
    put: (...a: unknown[]) => storePut(...a),
    remove: (...a: unknown[]) => storeRemove(...a),
    get: (...a: unknown[]) => storeGet(...a),
  }),
}));

const { publishPanel, PanelRenderError } = await import("../publish");

/**
 * `tx` falso: só entende exatamente as chamadas que `publishPanel` faz.
 * Identifica a tabela por identidade de referência (os objetos acima) para
 * devolver o dado certo a cada `select`/`insert`, e registra todo
 * `insert(...).values(...)` e `update(...).set(...)` em `inserts`/`updates`
 * (por nome de tabela) para os testes do encarte conferirem o que foi
 * gravado.
 */
function fakeTx(opts: {
  oldSlideAnnouncementIds: number[];
  oldAnnouncementImageUrls: Array<string | null>;
  newAnnouncementIds: number[];
}) {
  const newIds = [...opts.newAnnouncementIds];
  const inserts: Array<{ table: string; values: unknown }> = [];
  const updates: Array<{ table: string; set: unknown }> = [];
  const tableName = (table: unknown) => (table as { __name?: string })?.__name ?? "desconhecida";
  return {
    inserts,
    updates,
    select(_cols: unknown) {
      return {
        from(table: unknown) {
          return {
            where(_cond: unknown) {
              const resolved =
                table === panelSlidesTable
                  ? opts.oldSlideAnnouncementIds.map((id) => ({ announcementId: id }))
                  : table === announcementsTable
                    ? opts.oldAnnouncementImageUrls.map((imageUrl) => ({ imageUrl }))
                    : [];
              return {
                for: (_strength: string) => Promise.resolve(resolved),
                then: (resolve: (v: unknown) => void) => resolve(resolved),
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(vals: unknown) {
          inserts.push({ table: tableName(table), values: vals });
          if (table === announcementsTable) {
            const id = newIds.shift();
            return {
              returning: () => Promise.resolve([{ id }]),
              then: (resolve: (v: unknown) => void) => resolve(undefined),
            };
          }
          return Promise.resolve(undefined);
        },
      };
    },
    delete(_table: unknown) {
      return { where: (_cond: unknown) => Promise.resolve(undefined) };
    },
    update(table: unknown) {
      return {
        set: (patch: unknown) => {
          updates.push({ table: tableName(table), set: patch });
          return { where: (_cond: unknown) => Promise.resolve(undefined) };
        },
      };
    },
  };
}

type LogEntry =
  | { type: "put"; url: string }
  | { type: "remove"; url: string }
  | { type: "tx-start" }
  | { type: "tx-end" };

const basePanel = {
  id: 1,
  clientId: 7,
  name: "Painel",
  template: "t",
  status: "draft" as const,
  duration: 10,
  headline: null,
  body: null,
  accentColor: null,
  promoStyle: null,
  photoOffset: null,
  photoOffsetX: null,
  campaignId: null,
  artOutdated: false,
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const menuItem = (name: string, order: number) => ({
  id: order,
  panelId: 1,
  name,
  description: null,
  priceCents: 100,
  oldPriceCents: null,
  category: "Lanches",
  imageUrl: null,
  displayOrder: order,
  isActive: true,
});

/** Painel de encarte com 12 itens ativos, 3 deles em destaque (ids 1–3). */
const flyer = (over: Record<string, unknown> = {}) => ({
  id: 9,
  clientId: 7,
  kind: "flyer",
  name: "Encarte",
  template: "t",
  status: "draft" as const,
  duration: 10,
  headline: null,
  body: null,
  campaignId: null,
  accentColor: null,
  promoStyle: null,
  photoOffset: null,
  photoOffsetX: null,
  artOutdated: false,
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    panelId: 9,
    name: `P${i}`,
    description: null,
    priceCents: 100,
    oldPriceCents: null,
    category: null,
    imageUrl: i === 0 ? "https://x/foto.png" : null,
    displayOrder: i,
    isActive: true,
    unit: null,
    featured: i < 3,
  })),
  ...over,
});

const ctx = (campaign: unknown = null) => ({
  company: { name: "M", logoUrl: null, openingHours: null, brandColor: null, brandAccentColor: null, street: null, number: null, district: null, city: null, state: null },
  campaign,
});

describe("publishPanel — ordem de render/upload/transação", () => {
  let log: LogEntry[];

  beforeEach(() => {
    log = [];
    getPanel.mockReset();
    loadFlyerContext.mockReset();
    renderPanelPage.mockReset();
    renderFlyerPage.mockReset();
    fetchImageDataUri.mockReset();
    dbTransaction.mockReset();
    storePut.mockReset();
    storeRemove.mockReset();
    storeGet.mockReset();

    let n = 0;
    storePut.mockImplementation(async (_buf: Buffer, _mime: string, name: string) => {
      const url = `https://blob.example/${n++}-${name}`;
      log.push({ type: "put", url });
      return url;
    });
    storeRemove.mockImplementation(async (url: string) => {
      log.push({ type: "remove", url });
    });
  });

  it("todo store.put acontece antes da primeira chamada de transação, e a remoção das imagens ANTIGAS só depois que a transação resolve", async () => {
    const items = Array.from({ length: 16 }, (_, i) => menuItem(`Item ${i}`, i)); // 2 páginas de 8
    getPanel.mockResolvedValue({ ...basePanel, kind: "menu", items });
    renderPanelPage.mockResolvedValue(Buffer.from("png"));

    dbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<string[]>) => {
      log.push({ type: "tx-start" });
      const tx = fakeTx({
        oldSlideAnnouncementIds: [101, 102],
        oldAnnouncementImageUrls: ["https://blob.example/old1.png", "https://blob.example/old2.png"],
        newAnnouncementIds: [201, 202],
      });
      const result = await cb(tx);
      log.push({ type: "tx-end" });
      return result;
    });

    const result = await publishPanel(1);

    expect(result).toEqual({ pages: 2 });

    const txStartIndex = log.findIndex((e) => e.type === "tx-start");
    const txEndIndex = log.findIndex((e) => e.type === "tx-end");
    const putIndices = log.map((e, i) => (e.type === "put" ? i : -1)).filter((i) => i >= 0);
    const removeEntries = log.filter((e): e is { type: "remove"; url: string } => e.type === "remove");

    // (a) todo store.put acontece antes da primeira chamada de transação.
    expect(putIndices.length).toBe(2);
    for (const i of putIndices) expect(i).toBeLessThan(txStartIndex);

    // (c) store.remove das imagens ANTIGAS só depois que a transação resolve.
    expect(removeEntries.map((e) => e.url).sort()).toEqual(
      ["https://blob.example/old1.png", "https://blob.example/old2.png"].sort(),
    );
    for (const entry of removeEntries) {
      expect(log.indexOf(entry)).toBeGreaterThan(txEndIndex);
    }
  });

  it("quando renderPanelPage lança, zero chamada de transação e store.remove só das páginas já enviadas", async () => {
    const items = Array.from({ length: 24 }, (_, i) => menuItem(`Item ${i}`, i)); // 3 páginas de 8
    getPanel.mockResolvedValue({ ...basePanel, kind: "menu", items });
    renderPanelPage
      .mockResolvedValueOnce(Buffer.from("png-pagina-1"))
      .mockRejectedValueOnce(new Error("satori explodiu"));

    await expect(publishPanel(1)).rejects.toBeInstanceOf(PanelRenderError);

    expect(dbTransaction).not.toHaveBeenCalled();
    expect(storePut).toHaveBeenCalledTimes(1);
    const uploadedEntry = log.find((e) => e.type === "put");
    expect(uploadedEntry).toBeDefined();
    expect(storeRemove).toHaveBeenCalledTimes(1);
    expect(storeRemove).toHaveBeenCalledWith((uploadedEntry as { url: string }).url);
  });

  it("quando a transação falha (deadlock, conexão perdida), as páginas já enviadas são removidas e o erro original é relançado", async () => {
    const items = Array.from({ length: 8 }, (_, i) => menuItem(`Item ${i}`, i));
    getPanel.mockResolvedValue({ ...basePanel, kind: "menu", items });
    renderPanelPage.mockResolvedValue(Buffer.from("png"));

    const txError = new Error("conexão perdida com o banco");
    dbTransaction.mockRejectedValue(txError);

    await expect(publishPanel(1)).rejects.toBe(txError);

    expect(storePut).toHaveBeenCalledTimes(1);
    expect(storeRemove).toHaveBeenCalledTimes(1);
  });
});

describe("publishPanel — encarte", () => {
  let tx: ReturnType<typeof fakeTx>;

  beforeEach(() => {
    getPanel.mockReset();
    loadFlyerContext.mockReset();
    renderPanelPage.mockReset();
    renderFlyerPage.mockReset();
    fetchImageDataUri.mockReset();
    dbTransaction.mockReset();
    storePut.mockReset();
    storeRemove.mockReset();
    storeGet.mockReset();

    renderFlyerPage.mockResolvedValue(Buffer.from("png"));
    storePut.mockImplementation(async (_b: Buffer, _t: string, name: string) => `https://store/${name}`);
    storeRemove.mockResolvedValue(undefined);
  });

  /** Registra a transação com um `fakeTx` sem peças antigas e os ids novos informados. */
  function setupTx(newAnnouncementIds: number[]) {
    dbTransaction.mockImplementation(async (cb: (t: unknown) => Promise<string[]>) => {
      tx = fakeTx({ oldSlideAnnouncementIds: [], oldAnnouncementImageUrls: [], newAnnouncementIds });
      return cb(tx);
    });
  }

  it("encarte gera as duas orientações com numeração própria", async () => {
    getPanel.mockResolvedValue(flyer());
    loadFlyerContext.mockResolvedValue(ctx());
    fetchImageDataUri.mockResolvedValue("data:image/png;base64,AA");
    // 12 itens, 3 destaques: horizontal 3+4 e 5 → 2 páginas; vertical 3+6 e 3 → 2 páginas
    setupTx([301, 302, 303, 304]);

    const result = await publishPanel(9);

    expect(result.pages).toBe(4);
    const names = storePut.mock.calls.map((c) => c[2]);
    expect(names).toEqual([
      "panel-9-landscape-p1.png", "panel-9-landscape-p2.png",
      "panel-9-portrait-p1.png", "panel-9-portrait-p2.png",
    ]);

    // announcements inseridas com orientation certa
    const announcementInserts = tx.inserts.filter((i) => i.table === "announcements");
    expect(announcementInserts.map((i) => (i.values as { orientation: string }).orientation)).toEqual([
      "landscape", "landscape", "portrait", "portrait",
    ]);
    expect(announcementInserts.map((i) => (i.values as { displayOrder: number }).displayOrder)).toEqual([1, 2, 1, 2]);

    // panel_slides com orientation
    const slideInserts = tx.inserts.filter((i) => i.table === "panel_slides");
    expect(slideInserts.map((i) => (i.values as { orientation: string; pageNo: number }).orientation)).toEqual([
      "landscape", "landscape", "portrait", "portrait",
    ]);
    expect(slideInserts.map((i) => (i.values as { pageNo: number }).pageNo)).toEqual([1, 2, 1, 2]);

    // nenhuma linha em campaign_announcements (destino loja)
    expect(tx.inserts.filter((i) => i.table === "campaign_announcements")).toHaveLength(0);
  });

  it("foto é resolvida uma vez e reaproveitada nas duas orientações", async () => {
    getPanel.mockResolvedValue(flyer());
    loadFlyerContext.mockResolvedValue(ctx());
    fetchImageDataUri.mockResolvedValue("data:image/png;base64,AA");
    setupTx([301, 302, 303, 304]);

    await publishPanel(9);

    // Só o item 1 (i === 0) tem imageUrl; a logo da loja é nula neste ctx.
    // Se a foto fosse buscada de novo por orientação, teriam sido 2 chamadas.
    expect(fetchImageDataUri).toHaveBeenCalledTimes(1);
  });

  it("foto que falha some do card e a publicação segue", async () => {
    getPanel.mockResolvedValue(flyer());
    loadFlyerContext.mockResolvedValue(ctx());
    fetchImageDataUri.mockResolvedValue(null);
    setupTx([301, 302, 303, 304]);

    await expect(publishPanel(9)).resolves.toEqual({ pages: 4 });

    const firstPage = renderFlyerPage.mock.calls[0]![1] as { featured: Array<{ name: string; imageUrl: string | null }>; grid: Array<{ name: string; imageUrl: string | null }> };
    const p0 = [...firstPage.featured, ...firstPage.grid].find((i) => i.name === "P0");
    expect(p0).toBeDefined();
    expect(p0!.imageUrl).toBeNull();
  });

  it("destino campanha grava campaign_announcements para cada peça, sem scanCode", async () => {
    getPanel.mockResolvedValue(flyer({ campaignId: 3 }));
    loadFlyerContext.mockResolvedValue(ctx({ id: 3, startsAt: new Date(), endsAt: new Date() }));
    fetchImageDataUri.mockResolvedValue(null);
    setupTx([301, 302, 303, 304]);

    await publishPanel(9);

    const campaignInserts = tx.inserts.filter((i) => i.table === "campaign_announcements");
    expect(campaignInserts).toHaveLength(4);
    expect(campaignInserts.map((i) => i.values)).toEqual([
      { campaignId: 3, announcementId: 301, scanCode: null },
      { campaignId: 3, announcementId: 302, scanCode: null },
      { campaignId: 3, announcementId: 303, scanCode: null },
      { campaignId: 3, announcementId: 304, scanCode: null },
    ]);
  });

  it("publicação bem-sucedida zera artOutdated", async () => {
    getPanel.mockResolvedValue(flyer());
    loadFlyerContext.mockResolvedValue(ctx());
    fetchImageDataUri.mockResolvedValue(null);
    setupTx([301, 302, 303, 304]);

    await publishPanel(9);

    const panelUpdates = tx.updates.filter((u) => u.table === "panels");
    expect(panelUpdates).toHaveLength(1);
    expect(panelUpdates[0]!.set).toMatchObject({ status: "published", artOutdated: false });
  });

  it("mais de 60 itens ativos é recusado antes de renderizar", async () => {
    getPanel.mockResolvedValue(
      flyer({ items: Array.from({ length: 61 }, (_, i) => ({ ...flyer().items[0], id: i + 1, displayOrder: i, imageUrl: null })) }),
    );

    await expect(publishPanel(9)).rejects.toBeInstanceOf(PanelRenderError);
    expect(renderFlyerPage).not.toHaveBeenCalled();
  });

  it("campanha de outra empresa vira PanelRenderError", async () => {
    getPanel.mockResolvedValue(flyer({ campaignId: 3 }));
    const { FlyerCampaignMismatchError } = await import("../flyer-context");
    loadFlyerContext.mockRejectedValue(new FlyerCampaignMismatchError("A campanha escolhida não é desta loja."));

    const promise = publishPanel(9);
    await expect(promise).rejects.toBeInstanceOf(PanelRenderError);
    await expect(promise).rejects.toThrow("não é desta loja");
    expect(renderFlyerPage).not.toHaveBeenCalled();
  });
});
