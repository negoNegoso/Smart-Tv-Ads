import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_UPLOAD_BYTES, maxUploadBytes, uploadTooLargeMessage } from "../upload-limit";

describe("maxUploadBytes", () => {
  it("usa 20 MB quando MAX_UPLOAD_BYTES não está definida", () => {
    expect(maxUploadBytes({})).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(DEFAULT_MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
  });

  it("respeita o valor configurado", () => {
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "4000000" })).toBe(4000000);
  });

  it("ignora valor inválido e volta ao padrão", () => {
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "abc" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "0" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "-1" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "0.5" })).toBe(DEFAULT_MAX_UPLOAD_BYTES);
  });

  it("trunca valor fracionário", () => {
    expect(maxUploadBytes({ MAX_UPLOAD_BYTES: "1500.9" })).toBe(1500);
  });
});

describe("uploadTooLargeMessage", () => {
  it("informa o limite em megabytes, em português", () => {
    expect(uploadTooLargeMessage(4000000)).toBe("Imagem acima do limite de 4 MB.");
    expect(uploadTooLargeMessage(20 * 1024 * 1024)).toBe("Imagem acima do limite de 20 MB.");
  });
});
