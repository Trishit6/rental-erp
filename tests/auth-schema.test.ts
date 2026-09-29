import { describe, expect, it } from "vitest";
import {
  loginSchema,
  registerSchema,
  registerSchemaBase,
} from "../src/features/auth/components/schema";

describe("registration schema", () => {
  const valid = {
    name: "Arjun Mehta",
    email: "arjun@example.com",
    password: "s3curePass!",
    confirmPassword: "s3curePass!",
  };

  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a short password", () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords with the confirmPassword issue path", () => {
    const result = registerSchema.safeParse({
      ...valid,
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("confirmPassword");
      expect(result.error.issues[0]?.message).toBe("Passwords do not match");
    }
  });

  it("rejects a too-short name", () => {
    const result = registerSchemaBase.safeParse({ ...valid, name: "A" });
    expect(result.success).toBe(false);
  });

  it("requires confirm password", () => {
    const result = registerSchemaBase.safeParse({ ...valid, confirmPassword: "" });
    expect(result.success).toBe(false);
  });
});

describe("login schema", () => {
  it("accepts valid credentials shape", () => {
    expect(loginSchema.safeParse({ email: "buyer@revaro.local", password: "x" }).success).toBe(
      true,
    );
  });

  it("rejects empty fields", () => {
    expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });

  it("rejects a missing password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});
