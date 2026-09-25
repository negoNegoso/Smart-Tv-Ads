import { beforeEach, describe, expect, it, vi } from "vitest";

const flyerPanelIds = vi.fn();
const setOutdated = vi.fn();
vi.mock("@workspace/db", () => ({ db: {}, panelSlidesTable: {}, campaignAnnouncementsTable: {}, panelsTable: {} }));
const publishPanel = vi.fn();
const unpublishPanel = vi.fn();
vi.mock("../publish", () => ({
  publishPanel: (...a: unknown[]) => publishPanel(...a),
  unpublishPanel: (...a: unknown[]) => unpublishPanel(...a),
}));

const mod = await import("../campaign-flyers");
// substitui o acesso ao banco pelos espiões
vi.spyOn(mod.deps, "flyerPanelIdsInCampaign").mockImplementation((...a) => flyerPanelIds(...a));
vi.spyOn(mod.deps, "markArtOutdated").mockImplementation((...a) => setOutdated(...a));

describe("republishCampaignFlyers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("republica cada encarte e marca desatualizado o que falhar, sem lançar", async () => {
    flyerPanelIds.mockResolvedValue([1, 2]);
    publishPanel.mockResolvedValueOnce({ pages: 4 }).mockRejectedValueOnce(new Error("render"));
    const result = await mod.republishCampaignFlyers(3);
    expect(result).toEqual({ republished: [1], failed: [2] });
    expect(setOutdated).toHaveBeenCalledWith(2);
  });
});

describe("unpublishCampaignFlyers", () => {
  it("despublica todos os encartes da campanha", async () => {
    flyerPanelIds.mockResolvedValue([1, 2]);
    await mod.unpublishCampaignFlyers(3);
    expect(unpublishPanel.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });
});
