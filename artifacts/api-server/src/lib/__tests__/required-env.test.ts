import { describe, expect, it } from "vitest";
import { assertRequiredEnv } from "../required-env";

describe("assertRequiredEnv", () => {
  it("aceita ambiente com SCAN_SALT preenchido", () => {
    expect(() => assertRequiredEnv({ SCAN_SALT: "sal" })).not.toThrow();
  });

  it("rejeita SCAN_SALT ausente", () => {
    expect(() => assertRequiredEnv({})).toThrow(/SCAN_SALT/);
  });

  it("rejeita SCAN_SALT vazio", () => {
    expect(() => assertRequiredEnv({ SCAN_SALT: "" })).toThrow(/SCAN_SALT/);
  });
});
