/**
 * `orders.delivery_address_snapshot` holds JSON written at purchase time.
 *
 * Parsed on the server rather than in the client so a malformed value degrades to
 * "no address shown" instead of throwing during render — and so the type crossing
 * the wire is a real object rather than an opaque string the UI has to guess at.
 *
 * Extracted from `routes/orders.ts` when the seller order view needed the same
 * parse: both the customer's receipt and the seller's packing slip must read the
 * *same* snapshot the same way, and two copies would eventually disagree about
 * what a malformed value means.
 */
export function parseAddressSnapshot(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // `typeof []` is also `"object"`, so an array passes a bare object check and
    // would reach the client as an "address" with numeric keys. Anything that is
    // not a plain object is not an address.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The subset of an address a seller needs to fulfil an order.
 *
 * An explicit projection, not the whole parsed object: a snapshot is written
 * from whatever the customer's address form held at the time, so passing it
 * through wholesale would leak any field a future address form happens to add.
 * Unrelated addresses on the account are never read at all.
 */
export type FulfillmentAddress = {
  name: string | null;
  phone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function toFulfillmentAddress(raw: string | null): FulfillmentAddress | null {
  const parsed = parseAddressSnapshot(raw);
  if (!parsed) return null;

  // Two shapes are in the wild: the address form's `addressLine1/2` and older
  // rows that used `line1/line2`. Both are read so a receipt never loses its
  // street.
  const line1 = asText(parsed.addressLine1) ?? asText(parsed.line1);
  const line2 = asText(parsed.addressLine2) ?? asText(parsed.line2);

  const address: FulfillmentAddress = {
    name: asText(parsed.name),
    phone: asText(parsed.phone),
    line1,
    line2,
    city: asText(parsed.city),
    state: asText(parsed.state),
    postalCode: asText(parsed.postalCode),
    country: asText(parsed.country),
  };

  const hasAnything = Object.values(address).some((value) => value !== null);
  return hasAnything ? address : null;
}
