import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fingerprintFor } from "../scan-fingerprint";

const UA = "Mozilla/5.0 (iPhone) Safari/604.1";

describe("fingerprintFor", () => {
  beforeEach(() => {
    process.env.SCAN_SALT = "sal-de-teste";
  });

  afterEach(() => {
    delete process.env.SCAN_SALT;
  });

  it("é determinístico para o mesmo par ip + user-agent", () => {
    expect(fingerprintFor("203.0.113.9", UA)).toBe(fingerprintFor("203.0.113.9", UA));
  });

  it("muda quando o ip muda", () => {
    expect(fingerprintFor("203.0.113.9", UA)).not.toBe(fingerprintFor("203.0.113.10", UA));
  });

  it("muda quando o sal muda", () => {
    const comSalDeTeste = fingerprintFor("203.0.113.9", UA);
    process.env.SCAN_SALT = "outro-sal";
    expect(fingerprintFor("203.0.113.9", UA)).not.toBe(comSalDeTeste);
  });

  it("não vaza o ip no valor gerado", () => {
    expect(fingerprintFor("203.0.113.9", UA)).not.toContain("203.0.113.9");
    expect(fingerprintFor("203.0.113.9", UA)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("lança erro quando SCAN_SALT não está definida", () => {
    delete process.env.SCAN_SALT;
    expect(() => fingerprintFor("203.0.113.9", UA)).toThrow("SCAN_SALT must be set to record scans");
  });

  it("lança erro quando SCAN_SALT está vazia", () => {
    process.env.SCAN_SALT = "";
    expect(() => fingerprintFor("203.0.113.9", UA)).toThrow("SCAN_SALT must be set to record scans");
  });
});
