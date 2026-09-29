import { describe, expect, it } from "vitest";
import { parseAddressSnapshot, toFulfillmentAddress } from "../server/lib/address-snapshot";

describe("parseAddressSnapshot", () => {
  it("reads a JSON object", () => {
    expect(parseAddressSnapshot('{"city":"Bengaluru"}')).toEqual({ city: "Bengaluru" });
  });

  it("degrades to null instead of throwing on anything unusable", () => {
    // A malformed snapshot must render as "no address", never throw mid-render.
    expect(parseAddressSnapshot(null)).toBeNull();
    expect(parseAddressSnapshot("")).toBeNull();
    expect(parseAddressSnapshot("{not json")).toBeNull();
    expect(parseAddressSnapshot("[]")).toBeNull();
    expect(parseAddressSnapshot('"a string"')).toBeNull();
    expect(parseAddressSnapshot("42")).toBeNull();
  });
});

describe("toFulfillmentAddress is an explicit projection, not a passthrough", () => {
  it("keeps only the fields a seller needs to hand over a parcel", () => {
    const address = toFulfillmentAddress(
      JSON.stringify({
        name: "Rahul",
        phone: "+91 98000 00000",
        addressLine1: "12 Church Street",
        addressLine2: "Flat 3",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India",
        // Nothing below should survive: a snapshot is written from whatever the
        // address form held, so new fields must not ride along by default.
        userId: 12345,
        password: "hunter2",
        sessionToken: "abc",
        cardNumber: "4111111111111111",
        internalNotes: "vip",
      }),
    );

    expect(address).toEqual({
      name: "Rahul",
      phone: "+91 98000 00000",
      line1: "12 Church Street",
      line2: "Flat 3",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
    });
    expect(Object.keys(address!)).toHaveLength(8);
    expect(JSON.stringify(address)).not.toContain("hunter2");
    expect(JSON.stringify(address)).not.toContain("4111");
  });

  it("understands both address line spellings in the wild", () => {
    const modern = toFulfillmentAddress(JSON.stringify({ addressLine1: "A", addressLine2: "B" }));
    expect(modern?.line1).toBe("A");
    expect(modern?.line2).toBe("B");

    const legacy = toFulfillmentAddress(JSON.stringify({ line1: "A", line2: "B" }));
    expect(legacy?.line1).toBe("A");
    expect(legacy?.line2).toBe("B");
  });

  it("treats blank and non-string values as absent rather than as content", () => {
    const address = toFulfillmentAddress(
      JSON.stringify({ name: "   ", phone: 12345, city: "Pune" }),
    );
    expect(address?.name).toBeNull();
    expect(address?.phone).toBeNull();
    expect(address?.city).toBe("Pune");
  });

  it("returns null when there is genuinely nothing to show", () => {
    expect(toFulfillmentAddress(JSON.stringify({ userId: 12345 }))).toBeNull();
    expect(toFulfillmentAddress(JSON.stringify({}))).toBeNull();
    expect(toFulfillmentAddress(null)).toBeNull();
    expect(toFulfillmentAddress("{broken")).toBeNull();
  });
});
