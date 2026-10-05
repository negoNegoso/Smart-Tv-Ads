import { beforeEach, describe, expect, it, vi } from "vitest";

// db falso: o where(...) devolve as linhas que "existem" no banco.
let existing: { id: number }[] = [];
const select = vi.fn();
vi.mock("@workspace/db", () => ({
  db: {
    select: (...a: unknown[]) => {
      select(...a);
      return { from: () => ({ where: async () => existing }) };
    },
  },
  segmentsTable: { id: "id" },
}));

import { missingSegmentIds } from "../../lib/campaigns/segments";

describe("missingSegmentIds", () => {
  beforeEach(() => {
    select.mockReset();
    existing = [];
  });

  it("devolve os ids que sumiram (mesclados ou apagados)", async () => {
    existing = [{ id: 1 }];
    expect(await missingSegmentIds([1, 2, 2, 3])).toEqual([2, 3]);
  });

  it("lista vazia quando todos existem", async () => {
    existing = [{ id: 1 }, { id: 2 }];
    expect(await missingSegmentIds([1, 2])).toEqual([]);
  });

  it("sem ids não consulta o banco", async () => {
    expect(await missingSegmentIds([])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
