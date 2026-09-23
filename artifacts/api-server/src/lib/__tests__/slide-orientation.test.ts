import { describe, expect, it } from "vitest";
import { filterByOrientation } from "../slide-orientation";

const slides = [
  { announcementId: 1, orientation: "landscape" },
  { announcementId: 2, orientation: "portrait" },
  { announcementId: 3, orientation: null },
  { announcementId: 4, orientation: "algo-novo" },
];

describe("filterByOrientation", () => {
  it("TV deitada fica com as horizontais (nulo e desconhecido contam como horizontal)", () => {
    expect(filterByOrientation(slides, "landscape").map((s) => s.announcementId)).toEqual([1, 3, 4]);
  });
  it("TV retrato fica só com as verticais", () => {
    expect(filterByOrientation(slides, "portrait").map((s) => s.announcementId)).toEqual([2]);
  });
  it("preserva a ordem", () => {
    const ordem = [
      { announcementId: 9, orientation: "portrait" },
      { announcementId: 5, orientation: "portrait" },
    ];
    expect(filterByOrientation(ordem, "portrait").map((s) => s.announcementId)).toEqual([9, 5]);
  });
});
