import { describe, expect, it } from "vitest";
import {
  buildRentalTimeline,
  CLOSED_STATUSES,
  depositStatus,
  IN_HAND_STATUSES,
  isRentalBucket,
  isRentalStatus,
  RENTAL_EVENT_TYPES,
  RENTAL_STATUSES,
  rentalBucket,
  statusesForBucket,
} from "../server/lib/rental-lifecycle";
import { addDays, rentalDaysUntil, startOfDay } from "../src/lib/pricing";

/**
 * The rental lifecycle's decision rules.
 *
 * These are the functions that decide what "active" and "upcoming" mean. If
 * they are wrong, every card on the page lies, so they are pinned here rather
 * than exercised through the UI.
 */

const day = (iso: string) => new Date(iso);

describe("status vocabulary", () => {
  it("knows which states exist", () => {
    expect(RENTAL_STATUSES).toContain("CONFIRMED");
    expect(RENTAL_STATUSES).toContain("ACTIVE");
    expect(RENTAL_STATUSES).toContain("RETURN_PENDING");
    expect(isRentalStatus("RETURNED")).toBe(true);
    expect(isRentalStatus("UPCOMING")).toBe(false);
    expect(isRentalStatus("MELTED")).toBe(false);
  });

  it("groups the states the customer acts on", () => {
    // "In hand" and "closed" are the two sets the buckets are built from.
    expect(IN_HAND_STATUSES).toEqual(["ACTIVE", "RETURN_PENDING", "OVERDUE"]);
    expect(CLOSED_STATUSES).toEqual(["RETURNED", "COMPLETED", "CANCELLED"]);
    expect(statusesForBucket("active")).toEqual(IN_HAND_STATUSES);
    expect(statusesForBucket("completed")).toEqual(CLOSED_STATUSES);
    expect(statusesForBucket("upcoming")).toEqual(["CONFIRMED"]);
  });
});

describe("which tab a rental belongs in", () => {
  const now = day("2026-09-29T12:00:00.000Z");

  it("treats a future CONFIRMED booking as upcoming", () => {
    expect(rentalBucket("CONFIRMED", day("2026-11-01T00:00:00.000Z"), now)).toBe("upcoming");
  });

  it("treats a CONFIRMED booking that has started as active", () => {
    // Same status, different bucket: the dates decide, which is why UPCOMING is
    // never stored as its own value.
    expect(rentalBucket("CONFIRMED", day("2026-09-20T00:00:00.000Z"), now)).toBe("active");
  });

  it("counts the start day as started, not tomorrow", () => {
    expect(rentalBucket("CONFIRMED", day("2026-09-29T00:00:00.000Z"), now)).toBe("active");
  });

  it("puts anything in hand into active regardless of dates", () => {
    for (const status of IN_HAND_STATUSES) {
      expect(rentalBucket(status, day("2026-11-01T00:00:00.000Z"), now)).toBe("active");
    }
  });

  it("puts finished rentals in completed", () => {
    for (const status of CLOSED_STATUSES) {
      expect(rentalBucket(status, day("2020-01-01T00:00:00.000Z"), now)).toBe("completed");
    }
  });

  it("recognises the buckets", () => {
    expect(isRentalBucket("active")).toBe(true);
    expect(isRentalBucket("nope")).toBe(false);
  });
});

describe("the security deposit's state", () => {
  it("is HELD while the item is out", () => {
    expect(depositStatus("ACTIVE", 50_000)).toBe("HELD");
    expect(depositStatus("RETURN_PENDING", 50_000)).toBe("HELD");
    expect(depositStatus("OVERDUE", 50_000)).toBe("HELD");
  });

  it("is only ever RELEASE_PENDING after a return", () => {
    expect(depositStatus("RETURNED", 50_000)).toBe("RELEASE_PENDING");
    expect(depositStatus("COMPLETED", 50_000)).toBe("RELEASE_PENDING");
  });

  it("never claims RELEASED — no refund has been issued", () => {
    // Saying the money is back when no refund has run is the exact claim to avoid.
    for (const status of RENTAL_STATUSES) {
      expect(depositStatus(status, 50_000)).not.toBe("RELEASED");
      expect(depositStatus(status, 50_000)).not.toBe("ADJUSTED");
    }
  });

  it("is null when there is no deposit", () => {
    expect(depositStatus("ACTIVE", 0)).toBeNull();
  });
});

describe("the rental timeline is built from recorded events", () => {
  const CONFIRMED_AT = "2026-09-20T10:00:00.000Z";
  const STARTED_AT = "2026-09-29T03:30:00.000Z";
  const RETURN_REQUESTED_AT = "2026-10-05T09:00:00.000Z";
  const RETURNED_AT = "2026-10-05T12:00:00.000Z";

  const timeline = (events: { type: string; createdAt: string }[], status = "ACTIVE") =>
    buildRentalTimeline({ events, status, confirmedAt: CONFIRMED_AT });

  it("gives a step a time only when an event records one", () => {
    const events = timeline(
      [
        { type: "CONFIRMED", createdAt: CONFIRMED_AT },
        { type: "STARTED", createdAt: STARTED_AT },
      ],
      "ACTIVE",
    );
    const byKey = Object.fromEntries(events.map((e) => [e.key, e]));

    expect(byKey.CONFIRMED.at).toBe(CONFIRMED_AT);
    expect(byKey.STARTED.at).toBe(STARTED_AT);
    // Nothing after STARTED has happened, so those steps are waiting, untimed.
    expect(byKey.RETURNED.state).toBe("pending");
    expect(byKey.RETURNED.at).toBeNull();
  });

  it("omits a step nothing has ever recorded, rather than showing it waiting forever", () => {
    // `DELIVERY_COMPLETED` has no writer in this app. A permanent "Waiting" for
    // an event that can never arrive is worse than saying nothing.
    const events = timeline([{ type: "CONFIRMED", createdAt: CONFIRMED_AT }], "CONFIRMED");
    expect(events.map((e) => e.key)).not.toContain("DELIVERY_COMPLETED");
  });

  it("shows a requested return with the time it was asked for", () => {
    const events = timeline(
      [
        { type: "CONFIRMED", createdAt: CONFIRMED_AT },
        { type: "STARTED", createdAt: STARTED_AT },
        { type: "RETURN_REQUESTED", createdAt: RETURN_REQUESTED_AT },
      ],
      "RETURN_PENDING",
    );
    expect(events.find((e) => e.key === "RETURN_REQUESTED")?.at).toBe(RETURN_REQUESTED_AT);
  });

  it("marks returned and leaves completion pending, which is a real state", () => {
    const events = timeline(
      [
        { type: "CONFIRMED", createdAt: CONFIRMED_AT },
        { type: "STARTED", createdAt: STARTED_AT },
        { type: "RETURN_REQUESTED", createdAt: RETURN_REQUESTED_AT },
        { type: "RETURNED", createdAt: RETURNED_AT },
      ],
      "RETURNED",
    );
    expect(events.find((e) => e.key === "RETURNED")?.state).toBe("done");
    // Completion is the deposit release, which is a future feature — so the
    // timeline honestly shows it as still to come.
    expect(events.find((e) => e.key === "COMPLETED")?.state).toBe("pending");
  });

  it("ends the story at cancellation", () => {
    const events = timeline(
      [
        { type: "CONFIRMED", createdAt: CONFIRMED_AT },
        { type: "CANCELLED", createdAt: "2026-09-21T10:00:00.000Z" },
      ],
      "CANCELLED",
    );
    expect(events.at(-1)?.key).toBe("CANCELLED");
    // Nothing is still ahead of a cancelled rental.
    expect(events.map((e) => e.key)).not.toContain("STARTED");
    expect(events.map((e) => e.key)).not.toContain("RETURNED");
  });

  it("keeps the lifecycle in order regardless of insert order", () => {
    const events = timeline(
      [
        { type: "STARTED", createdAt: STARTED_AT },
        { type: "CONFIRMED", createdAt: CONFIRMED_AT },
      ],
      "ACTIVE",
    );
    expect(events.map((e) => e.key)).toEqual(["CONFIRMED", "STARTED", "RETURN_REQUESTED", "RETURNED", "COMPLETED"]);
  });

  it("falls back to the real creation time for a row predating the events table", () => {
    // `createdAt` is a genuine timestamp, not a stand-in, so a legacy rental
    // still has a history rather than an empty one.
    const events = timeline([], "CONFIRMED");
    expect(events[0]?.key).toBe("CONFIRMED");
    expect(events[0]?.at).toBe(CONFIRMED_AT);
  });

  it("keeps the first time seen for a duplicated event", () => {
    const events = timeline(
      [
        { type: "CONFIRMED", createdAt: CONFIRMED_AT },
        { type: "CONFIRMED", createdAt: "2099-01-01T00:00:00.000Z" },
      ],
      "CONFIRMED",
    );
    expect(events.find((e) => e.key === "CONFIRMED")?.at).toBe(CONFIRMED_AT);
  });
});

describe("the event vocabulary", () => {
  it("declares the lifecycle steps, and reserves the one nothing writes yet", () => {
    expect(RENTAL_EVENT_TYPES).toContain("CONFIRMED");
    expect(RENTAL_EVENT_TYPES).toContain("STARTED");
    expect(RENTAL_EVENT_TYPES).toContain("RETURN_REQUESTED");
    expect(RENTAL_EVENT_TYPES).toContain("RETURNED");
    // Declared for a future logistics integration; no code path writes it.
    expect(RENTAL_EVENT_TYPES).toContain("DELIVERY_COMPLETED");
  });

  it("has no OVERDUE event, because overdue is derived from the dates", () => {
    // An event implies a recorded moment; overdue has none.
    expect(RENTAL_EVENT_TYPES).not.toContain("OVERDUE");
  });
});

describe("day arithmetic", () => {
  it("counts whole days, never a fraction", () => {
    // The columns are day-precision, so a rental ending today has zero days left.
    expect(rentalDaysUntil(day("2026-09-29T23:59:00.000Z"), day("2026-09-29T00:00:00.000Z"))).toBe(0);
    expect(rentalDaysUntil(day("2026-09-29T00:00:00.000Z"), day("2026-10-06T00:00:00.000Z"))).toBe(7);
  });

  it("never returns a negative count", () => {
    expect(rentalDaysUntil(day("2026-10-06T00:00:00.000Z"), day("2026-09-29T00:00:00.000Z"))).toBe(0);
  });

  it("is stable across a timezone boundary", () => {
    // 23:30 UTC is the next day in Asia/Tokyo; the count must not move.
    const lateUtc = day("2026-09-29T23:30:00.000Z");
    expect(rentalDaysUntil(lateUtc, day("2026-10-01T00:00:00.000Z"))).toBe(2);
  });

  it("adds days in UTC so DST cannot shift the result", () => {
    const added = addDays(day("2026-03-28T00:00:00.000Z"), 3);
    expect(added.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("truncates to a UTC day boundary", () => {
    expect(startOfDay(day("2026-09-29T18:45:00.000Z")).toISOString()).toBe(
      "2026-09-29T00:00:00.000Z",
    );
  });
});
