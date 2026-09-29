import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { deleteCookie, getCookie } from "hono/cookie";
import { db } from "../db";
import { users } from "../schema";
import { fail, ok, rateLimit, HttpError } from "../lib/api";
import { createSession, deleteSession, requireUser, SESSION_COOKIE } from "../lib/auth";

export const auth = new Hono();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verified: user.verified,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    createdAt: user.createdAt,
  };
}

auth.use("/register", rateLimit(5, 60_000));
auth.use("/login", rateLimit(10, 60_000));

auth.post("/register", async (c) => {
  const input = registerSchema.parse(await c.req.json());
  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) {
    throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  // Registration always creates a plain USER — roles are never taken from the client.
  const [created] = await db
    .insert(users)
    .values({ name: input.name, email: input.email, passwordHash, role: "USER" })
    .$returningId();

  await createSession(c, created.id);
  const [user] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
  return c.json(ok(publicUser(user)), 201);
});

auth.post("/login", async (c) => {
  const input = loginSchema.parse(await c.req.json());
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    return c.json(fail("INVALID_CREDENTIALS", "Email or password is incorrect."), 401);
  }
  await createSession(c, user.id);
  return c.json(ok(publicUser(user)));
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  await deleteSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json(ok({ loggedOut: true }));
});

auth.get("/me", (c) => {
  const user = requireUser(c);
  return c.json(ok(user));
});

auth.patch("/me", async (c) => {
  const user = requireUser(c);
  const input = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      phone: z.string().trim().max(20).optional(),
      avatarUrl: z.string().url().max(500).optional(),
    })
    .parse(await c.req.json());
  await db.update(users).set(input).where(eq(users.id, user.id));
  const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return c.json(ok(publicUser(updated)));
});
