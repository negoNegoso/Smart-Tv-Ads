import { describe, expect, it } from "vitest";
import { parseFormBoolean } from "../form-values";

describe("parseFormBoolean", () => {
  it('lê "true" como verdadeiro', () => {
    expect(parseFormBoolean("true")).toBe(true);
  });

  it('lê "false" como falso', () => {
    expect(parseFormBoolean("false")).toBe(false);
  });

  it('lê "on" do checkbox como verdadeiro', () => {
    expect(parseFormBoolean("on")).toBe(true);
  });

  it("aceita booleano puro de requisições JSON", () => {
    expect(parseFormBoolean(true)).toBe(true);
    expect(parseFormBoolean(false)).toBe(false);
  });

  it("devolve undefined quando o campo não foi enviado", () => {
    expect(parseFormBoolean(undefined)).toBeUndefined();
    expect(parseFormBoolean("")).toBeUndefined();
  });
});
