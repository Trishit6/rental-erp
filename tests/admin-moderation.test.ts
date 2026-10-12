import { describe, expect, it } from "vitest";
import {
  BULK_MODERATION_ACTIONS,
  MODERATION_ACTIONS,
  bulkModerationDecisionSchema,
  matchingFlagWords,
  moderationDecisionSchema,
} from "../server/lib/moderation";
import {
  MODERATION_ACTIONS as CLIENT_ACTIONS,
  flagWordMatches,
  moderationActionsForTarget,
} from "../src/features/admin/api";
import { ROLE_PERMISSION_GRANTS } from "../server/lib/permission-catalogue";

/**
 * PROMPT 29 — the pure parts of the moderation hub.
 *
 * The decision vocabulary, its validation and the keyword matcher are the pieces a
 * database cannot get wrong on its own, so they are asserted without one. The route
 * wiring is covered by the gate coverage in `admin-permissions.test.ts` and the
 * notification emitters by `notification-events.test.ts`.
 */

describe("the decision vocabulary", () => {
  it("agrees between the server and the client", () => {
    // Two copies exist because the app and server compile separately. If they drift,
    // a moderator is offered a decision the server rejects — so they are compared
    // here rather than left to a code review.
    expect([...CLIENT_ACTIONS]).toEqual([...MODERATION_ACTIONS]);
  });

  it("has no duplicates", () => {
    expect(new Set(MODERATION_ACTIONS).size).toBe(MODERATION_ACTIONS.length);
  });

  it("keeps bulk confined to the two actions that touch no target", () => {
    expect([...BULK_MODERATION_ACTIONS]).toEqual(["RESOLVED", "DISMISSED"]);
  });
});

describe("moderationDecisionSchema", () => {
  it("accepts a decision with a reason", () => {
    expect(
      moderationDecisionSchema.parse({ action: "REVIEW_HIDDEN", reason: "Abusive language" }),
    ).toEqual({ action: "REVIEW_HIDDEN", reason: "Abusive language" });
  });

  it("refuses an unknown action", () => {
    expect(() =>
      moderationDecisionSchema.parse({ action: "DELETE_EVERYTHING", reason: "nope" }),
    ).toThrow();
  });

  it("requires a substantive reason", () => {
    expect(() => moderationDecisionSchema.parse({ action: "DISMISSED", reason: "ok" })).toThrow();
    expect(() => moderationDecisionSchema.parse({ action: "DISMISSED", reason: "   " })).toThrow();
  });

  it("refuses unknown keys rather than dropping them silently", () => {
    expect(() =>
      moderationDecisionSchema.parse({ action: "DISMISSED", reason: "no action", target: "user" }),
    ).toThrow();
  });
});

describe("bulkModerationDecisionSchema", () => {
  it("accepts a batch of resolvable ids", () => {
    expect(
      bulkModerationDecisionSchema.parse({ ids: [1, 2, 3], action: "RESOLVED", reason: "Spam wave" }),
    ).toMatchObject({ ids: [1, 2, 3], action: "RESOLVED" });
  });

  it("refuses a target-modifying action in bulk", () => {
    expect(() =>
      bulkModerationDecisionSchema.parse({ ids: [1], action: "USER_SUSPENDED", reason: "nope" }),
    ).toThrow();
    expect(() =>
      bulkModerationDecisionSchema.parse({ ids: [1], action: "PRODUCT_HIDDEN", reason: "nope" }),
    ).toThrow();
  });

  it("needs at least one id and caps the batch", () => {
    expect(() =>
      bulkModerationDecisionSchema.parse({ ids: [], action: "DISMISSED", reason: "none" }),
    ).toThrow();
    expect(() =>
      bulkModerationDecisionSchema.parse({
        ids: Array.from({ length: 201 }, (_, index) => index + 1),
        action: "DISMISSED",
        reason: "too many",
      }),
    ).toThrow();
  });
});

describe("the flag-word matcher", () => {
  const words = ["scam", "counterfeit", "refund"];

  it("finds configured words, case-insensitively", () => {
    expect(matchingFlagWords("This is a SCAM, absolute scam", words)).toEqual(["scam"]);
    expect(matchingFlagWords("possible COUNTERFEIT item", words)).toEqual(["counterfeit"]);
  });

  it("returns nothing for clean or empty text", () => {
    expect(matchingFlagWords("a lovely camera", words)).toEqual([]);
    expect(matchingFlagWords(null, words)).toEqual([]);
    expect(matchingFlagWords(undefined, words)).toEqual([]);
  });

  it("ignores blank configured words", () => {
    expect(matchingFlagWords("anything", ["", "  "])).toEqual([]);
  });

  it("agrees with the client's copy", () => {
    for (const text of ["a scam", "CLEAN", "refund and counterfeit", ""]) {
      expect(flagWordMatches(text, words)).toEqual(matchingFlagWords(text, words));
    }
  });
});

describe("the actions offered for a target", () => {
  it("always offers resolve and dismiss, and nothing unknown", () => {
    for (const target of ["product", "user", "review", "message", "order", "rental", "mystery"]) {
      const actions = moderationActionsForTarget(target);
      expect(actions).toContain("RESOLVED");
      expect(actions).toContain("DISMISSED");
      for (const action of actions) {
        expect(MODERATION_ACTIONS).toContain(action);
      }
    }
  });

  it("does not offer a listing action on a report about a person", () => {
    expect(moderationActionsForTarget("user")).not.toContain("PRODUCT_HIDDEN");
    expect(moderationActionsForTarget("message")).not.toContain("REVIEW_HIDDEN");
  });
});

describe("who can work the moderation queues", () => {
  it("lets SUPPORT and MODERATOR read and resolve reports", () => {
    for (const role of ["SUPPORT", "MODERATOR"] as const) {
      expect(ROLE_PERMISSION_GRANTS[role]).toContain("reports.view");
      expect(ROLE_PERMISSION_GRANTS[role]).toContain("reports.resolve");
    }
  });

  it("keeps a content manager out of the moderation queue", () => {
    expect(ROLE_PERMISSION_GRANTS.CONTENT_MANAGER).not.toContain("reports.resolve");
    // A content manager may not edit the platform settings the flag list lives in.
    expect(ROLE_PERMISSION_GRANTS.CONTENT_MANAGER).not.toContain("settings.manage");
  });

  it("keeps the flag-word setting with the accounts that administer the platform", () => {
    expect(ROLE_PERMISSION_GRANTS.ADMIN).toContain("settings.manage");
    expect(ROLE_PERMISSION_GRANTS.SUPER_ADMIN).toContain("settings.manage");
    expect(ROLE_PERMISSION_GRANTS.MODERATOR).not.toContain("settings.manage");
  });
});
