import { describe, expect, it } from "vitest";
import { formatClock } from "../clock";

describe("formatClock", () => {
  it("dia da semana, data e hora em São Paulo", () => {
    expect(formatClock(new Date("2026-10-07T18:42:00Z"))).toBe("quarta, 7 de outubro · 15:42");
  });

  it("02:30 UTC ainda é o dia anterior em São Paulo", () => {
    expect(formatClock(new Date("2026-10-08T02:30:00Z"))).toBe("quarta, 7 de outubro · 23:30");
  });

  it("sábado e domingo não têm -feira para tirar", () => {
    expect(formatClock(new Date("2026-10-10T13:05:00Z"))).toBe("sábado, 10 de outubro · 10:05");
    expect(formatClock(new Date("2026-10-11T03:00:00Z"))).toBe("domingo, 11 de outubro · 00:00");
  });
});
