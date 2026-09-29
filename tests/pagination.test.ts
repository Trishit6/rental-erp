import { describe, expect, it } from "vitest";
import { buildPageItems } from "../src/components/shared/pagination";

describe("buildPageItems", () => {
  it("lists every page when there are few", () => {
    expect(buildPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("windows the middle with gaps", () => {
    expect(buildPageItems(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
  });

  it("keeps the first pages contiguous at the start", () => {
    expect(buildPageItems(1, 12)).toEqual([1, 2, "gap", 12]);
  });

  it("keeps the last pages contiguous at the end", () => {
    expect(buildPageItems(12, 12)).toEqual([1, "gap", 11, 12]);
  });

  it("never repeats a page number", () => {
    const items = buildPageItems(5, 20).filter((item): item is number => item !== "gap");
    expect(new Set(items).size).toBe(items.length);
  });
});
