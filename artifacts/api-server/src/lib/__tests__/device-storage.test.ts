import { describe, expect, it } from "vitest";
import { LOW_STORAGE_BYTES, lowStorage, parseStorageHeader, storageView } from "../device-storage";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("parseStorageHeader", () => {
  it("lê os quatro campos", () => {
    expect(parseStorageHeader("livre=1000;total=8000;cache=300;arquivos=12")).toEqual({
      freeBytes: 1000,
      totalBytes: 8000,
      cacheBytes: 300,
      cacheFiles: 12,
    });
  });

  it("aceita espaços e ordem trocada", () => {
    expect(parseStorageHeader(" arquivos=1 ; cache=2;total=9; livre=3")).toEqual({
      freeBytes: 3,
      totalBytes: 9,
      cacheBytes: 2,
      cacheFiles: 1,
    });
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["livre=1;total=2;cache=3"],
    ["livre=-1;total=2;cache=3;arquivos=1"],
    ["livre=abc;total=2;cache=3;arquivos=1"],
    ["livre=1.5;total=2;cache=3;arquivos=1"],
    ["livre=9;total=2;cache=3;arquivos=1"],
    ["livre=1;total=9999999999999999;cache=3;arquivos=1"],
    ["livre=1;total=2;cache=3;arquivos=99999999999"],
  ])("recusa %s", (valor) => {
    expect(parseStorageHeader(valor as string | null | undefined)).toBeNull();
  });
});

describe("lowStorage", () => {
  it("abaixo de 500 MB é pouco espaço", () => {
    expect(lowStorage(LOW_STORAGE_BYTES - 1, 64 * GB)).toBe(true);
    expect(lowStorage(LOW_STORAGE_BYTES, 4 * GB)).toBe(false);
  });

  it("abaixo de 10% do total é pouco espaço", () => {
    expect(lowStorage(6 * GB - 1, 60 * GB)).toBe(true);
    expect(lowStorage(6 * GB, 60 * GB)).toBe(false);
  });

  it("sem leitura não é pouco espaço", () => {
    expect(lowStorage(null, null)).toBe(false);
    expect(lowStorage(100, null)).toBe(false);
  });
});

describe("storageView", () => {
  it("monta a visão com o selo", () => {
    const reportedAt = new Date("2026-10-08T12:00:00Z");
    expect(
      storageView({ storageFreeBytes: 100 * MB, storageTotalBytes: 8 * GB, cacheBytes: 50 * MB, cacheFiles: 3, storageReportedAt: reportedAt }),
    ).toEqual({ freeBytes: 100 * MB, totalBytes: 8 * GB, cacheBytes: 50 * MB, cacheFiles: 3, reportedAt: reportedAt.toISOString(), low: true });
  });

  it("TV que nunca mandou leitura → null", () => {
    expect(
      storageView({ storageFreeBytes: null, storageTotalBytes: null, cacheBytes: null, cacheFiles: null, storageReportedAt: null }),
    ).toBeNull();
  });
});
