import { describe, expect, it } from "vitest";
import { formatBytes } from "../bytes";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("formatBytes", () => {
  it.each([
    [340 * MB, "340 MB"],
    [0, "0 MB"],
    [1.2 * GB, "1,2 GB"],
    [8 * GB, "8 GB"],
    [1023 * MB, "1023 MB"],
  ])("%d → %s", (n, texto) => {
    expect(formatBytes(n)).toBe(texto);
  });
});
