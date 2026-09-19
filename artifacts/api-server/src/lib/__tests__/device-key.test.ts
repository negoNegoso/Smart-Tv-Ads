import { describe, expect, it } from "vitest";
import { DEVICE_KEY_PATTERN, normalizeDeviceKey, parseDeviceKey } from "../device-key";

describe("device key", () => {
  it("normaliza minúsculas, traços e espaços", () => {
    expect(normalizeDeviceKey("a1b2-c3d4 e5f6-a7b8")).toBe("A1B2C3D4E5F6A7B8");
  });

  it("aceita 16 hex maiúsculos", () => {
    expect(DEVICE_KEY_PATTERN.test("A1B2C3D4E5F6A7B8")).toBe(true);
  });

  it("parse devolve a key normalizada quando válida", () => {
    expect(parseDeviceKey("a1b2-c3d4-e5f6-a7b8")).toBe("A1B2C3D4E5F6A7B8");
  });

  it("parse recusa tamanho errado, fora de hex e não-string", () => {
    expect(parseDeviceKey("A1B2C3D4E5F6A7B")).toBeNull();
    expect(parseDeviceKey("G1B2C3D4E5F6A7B8")).toBeNull();
    expect(parseDeviceKey(42)).toBeNull();
    expect(parseDeviceKey(undefined)).toBeNull();
  });
});
