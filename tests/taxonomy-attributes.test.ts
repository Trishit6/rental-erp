import { describe, expect, it } from "vitest";
import { validateProductAttributes } from "../server/lib/taxonomy/attributes";

describe("attribute validation", () => {
  const defs = [
    { key: "megapixels", label: "Megapixels", type: "NUMBER" as const, min: 1, max: 100, required: true },
    { key: "color", label: "Color", type: "SELECT" as const, options: [{ key: "black", label: "Black" }] },
  ];
  it("errors on missing required", () => {
    const res = validateProductAttributes([{ key: "megapixels", label: "Megapixels", type: "NUMBER", required: false }], [], new Set(["megapixels"]));
    expect(res.errors["attributes.megapixels"]).toBe("required");
    expect(res.rows.length).toBe(0);
  });
  it("accepts valid numbers/options", () => {
    const r = validateProductAttributes(defs, [
      { key: "megapixels", number: 24 },
      { key: "color", text: "black" },
    ], new Set(["megapixels"]));
    expect(r.errors).toEqual({});
    expect(r.rows.length).toBe(2);
  });
  it("rejects invalid option", () => {
    const r = validateProductAttributes(defs, [{ key: "color", text: "red" }], new Set());
    expect(r.errors["attributes.color"]).toBe("invalid option");
  });
});