import { describe, expect, it } from "vitest";
import { renderAlert } from "../render";

/** Lê largura e altura do cabeçalho IHDR de um PNG (bytes 16..24). */
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const arte = { title: "Hoje fechamos às 18h", body: "Voltamos amanhã às 8h." };

describe("renderAlert", () => {
  it("aviso deitado vira PNG 1920×1080", async () => {
    expect(pngSize(await renderAlert(arte, "landscape"))).toEqual({ width: 1920, height: 1080 });
  });

  it("aviso em pé vira PNG 1080×1920", async () => {
    expect(pngSize(await renderAlert(arte, "portrait"))).toEqual({ width: 1080, height: 1920 });
  });
});
