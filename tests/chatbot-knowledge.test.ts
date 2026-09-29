import { describe, expect, it } from "vitest";
import {
  answerFromKnowledge,
  deriveProductQuery,
  isProductSeeking,
} from "../server/lib/chatbot-knowledge";

describe("assistant knowledge base", () => {
  it("matches the renting topic", () => {
    const match = answerFromKnowledge("how does renting work on revaro?");
    expect(match?.entry.id).toBe("renting");
    expect(match!.score).toBeGreaterThanOrEqual(2);
  });

  it("answers a delivery fee question", () => {
    const match = answerFromKnowledge("how much is delivery?");
    expect(match?.entry.id).toBe("delivery");
  });

  it("recognises a greeting", () => {
    expect(answerFromKnowledge("hey there")?.entry.id).toBe("greeting");
  });

  it("returns null for gibberish", () => {
    expect(answerFromKnowledge("zzzz qqqq")).toBeNull();
  });

  it("prefers the specific topic over a generic word", () => {
    const match = answerFromKnowledge("what is a security deposit for renting?");
    expect(match?.entry.id).toBe("deposit");
  });
});

describe("product query derivation", () => {
  it("strips stopwords and keeps the noun", () => {
    expect(deriveProductQuery("I want to find a camera")).toBe("camera");
  });

  it("keeps a few meaningful terms", () => {
    expect(deriveProductQuery("show me a cheap camping tent")).toBe("camping tent");
  });

  it("returns null when there is nothing meaningful", () => {
    expect(deriveProductQuery("hi how are you")).toBeNull();
  });
});

describe("product-seeking intent", () => {
  it("detects find/show phrasing", () => {
    expect(isProductSeeking("find me a drill")).toBe(true);
    expect(isProductSeeking("show cameras")).toBe(true);
  });

  it("does not treat policies as product searches", () => {
    expect(isProductSeeking("what is a security deposit")).toBe(false);
  });
});
