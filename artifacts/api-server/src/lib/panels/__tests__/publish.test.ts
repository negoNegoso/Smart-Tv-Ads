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

const dbTransaction = vi.fn();
vi.mock("@workspace/db", () => ({
  db: { transaction: (...a: unknown[]) => dbTransaction(...a) },
  panelsTable,
  panelSlidesTable,
  announcementsTable,
}));

const getPanel = vi.fn();
vi.mock("../queries", () => ({ getPanel: (...a: unknown[]) => getPanel(...a) }));

const renderPanelPage = vi.fn();
vi.mock("../render", () => ({ renderPanelPage: (...a: unknown[]) => renderPanelPage(...a) }));

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
 * devolver o dado certo a cada `select`/`insert`.
 */
function fakeTx(opts: {
  oldSlideAnnouncementIds: number[];
  oldAnnouncementImageUrls: Array<string | null>;
  newAnnouncementIds: number[];
}) {
  const newIds = [...opts.newAnnouncementIds];
  return {
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
        values(_vals: unknown) {
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
    update(_table: unknown) {
      return { set: (_patch: unknown) => ({ where: (_cond: unknown) => Promise.resolve(undefined) }) };
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

describe("publishPanel — ordem de render/upload/transação", () => {
  let log: LogEntry[];

  beforeEach(() => {
    log = [];
    getPanel.mockReset();
    renderPanelPage.mockReset();
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
