import { describe, expect, it } from "vitest";
import { historyStartFrom } from "../history";

describe("historyStartFrom", () => {
  // A gravação começou no meio do dia local: esse dia é parcial e vira "sem dados".
  it("é o dia seguinte ao dia local da sessão mais antiga", () => {
    expect(historyStartFrom(new Date("2026-09-25T13:00:00Z"), "America/Sao_Paulo")).toBe("2026-09-26");
  });

  it("usa o dia local, não o UTC (23h de São Paulo ainda é o dia anterior)", () => {
    expect(historyStartFrom(new Date("2026-09-26T02:00:00Z"), "America/Sao_Paulo")).toBe("2026-09-26");
  });

  it("aceita o texto que o driver devolve para MIN(timestamptz)", () => {
    expect(historyStartFrom("2026-09-25 13:00:00+00", "America/Sao_Paulo")).toBe("2026-09-26");
  });

  it("sem sessão nenhuma, não há histórico", () => {
    expect(historyStartFrom(null)).toBeNull();
    expect(historyStartFrom(undefined)).toBeNull();
  });
});
