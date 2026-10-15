import { describe, expect, it } from "vitest";
import { computeDepth, wouldCreateCycle, normalizeBrandName, slugify, buildSearchText } from "../server/lib/taxonomy";

describe("taxonomy tree helpers", () => {
  it("computeDepth levels", () => {
    expect(computeDepth(null)).toBe(1);
    expect(computeDepth(1)).toBe(2);
    expect(computeDepth(2)).toBe(3);
  });
  it("wouldCreateCycle catches direct and indirect", () => {
    const parents = new Map<number, number | null>([
      [2, 1],
      [3, 2],
    ]);
    expect(wouldCreateCycle(1, 2, parents)).toBe(true);
    expect(wouldCreateCycle(3, 1, parents)).toBe(false);
    expect(wouldCreateCycle(1, null, parents)).toBe(false);
  });
  it("normalizeBrandName trims and collapses", () => {
    expect(normalizeBrandName("  Canon   Inc  ")).toBe("Canon Inc");
  });
  it("slugify", () => {
    expect(slugify("Canon Inc.")).toBe("canon-inc");
  });
  it("buildSearchText dedups", () => {
    const r = buildSearchText({ title: "Camera", tags: ["camera", "photo"], attributeValues: ["photo"] });
    expect(r.toLowerCase().match(/photo/g)?.length).toBe(1);
  });
});