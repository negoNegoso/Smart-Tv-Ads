import { describe, expect, it } from "vitest";
import {
  parseAnnouncementOrientation,
  pieceOrientationOf,
  screenOrientationOf,
} from "@workspace/db/orientation";

describe("screenOrientationOf", () => {
  it("os dois retratos viram portrait", () => {
    expect(screenOrientationOf("portrait_right")).toBe("portrait");
    expect(screenOrientationOf("portrait_left")).toBe("portrait");
  });
  it("landscape, nulo e valor desconhecido viram landscape", () => {
    expect(screenOrientationOf("landscape")).toBe("landscape");
    expect(screenOrientationOf(null)).toBe("landscape");
    expect(screenOrientationOf(undefined)).toBe("landscape");
    expect(screenOrientationOf("diagonal")).toBe("landscape");
  });
});

describe("pieceOrientationOf", () => {
  it("só portrait é portrait", () => {
    expect(pieceOrientationOf("portrait")).toBe("portrait");
    expect(pieceOrientationOf("landscape")).toBe("landscape");
    expect(pieceOrientationOf(undefined)).toBe("landscape");
    expect(pieceOrientationOf("x")).toBe("landscape");
  });
});

describe("parseAnnouncementOrientation", () => {
  it("ausente ou vazio é undefined (cliente antigo)", () => {
    expect(parseAnnouncementOrientation(undefined)).toBeUndefined();
    expect(parseAnnouncementOrientation("")).toBeUndefined();
  });
  it("valor válido passa", () => {
    expect(parseAnnouncementOrientation("portrait")).toBe("portrait");
    expect(parseAnnouncementOrientation("landscape")).toBe("landscape");
  });
  it("valor inválido é null", () => {
    expect(parseAnnouncementOrientation("portrait_right")).toBeNull();
    expect(parseAnnouncementOrientation("vertical")).toBeNull();
  });
});
