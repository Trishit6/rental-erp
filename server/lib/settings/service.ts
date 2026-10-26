import { db } from "../../db";
import { platformSettings } from "../../schema";
import { eq } from "drizzle-orm";
import { getRegistryEntry } from "./registry";

type CacheEntry = { value: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 1000;

function now() {
  return Date.now();
}

function isExpired(entry: CacheEntry) {
  return entry.expiresAt < now();
}

export function invalidateSetting(key?: string) {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
}

export async function getSetting<T = unknown>(key: string): Promise<T> {
  const cached = cache.get(key);
  if (cached && !isExpired(cached)) {
    return cached.value as T;
  }
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value as string);
      cache.set(key, { value: parsed, expiresAt: now() + TTL_MS });
      return parsed as T;
    } catch {
      // fall through to default
    }
  }
  const def = getRegistryEntry(key);
  const value = def?.defaultValue as T;
  cache.set(key, { value, expiresAt: now() + TTL_MS });
  return value;
}

export async function getSettingWithMeta(key: string) {
  const def = getRegistryEntry(key);
  const [row] = await db
    .select({ value: platformSettings.value, updatedBy: platformSettings.updatedBy, updatedAt: platformSettings.updatedAt })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  let value: unknown = def?.defaultValue;
  if (row?.value) {
    try {
      value = JSON.parse(row.value as string);
    } catch {
      value = def?.defaultValue;
    }
  }
  return {
    key,
    value,
    defaultValue: def?.defaultValue,
    overridden: !!row,
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
    definition: def ?? null,
  };
}

export async function setSetting(key: string, value: unknown, updatedBy?: number | null) {
  const def = getRegistryEntry(key);
  if (!def) throw new Error("UNKNOWN_SETTING");
  const validated = def.validate(value);
  const serialized = JSON.stringify(validated);
  await db
    .insert(platformSettings)
    .values({ key, value: serialized, description: def.description, updatedBy: updatedBy ?? null })
    .onDuplicateKeyUpdate({ set: { value: serialized, updatedBy: updatedBy ?? null } });
  invalidateSetting(key);
  return { key, value: validated };
}

export async function resetSetting(key: string) {
  await db.delete(platformSettings).where(eq(platformSettings.key, key));
  invalidateSetting(key);
  return { key, reset: true };
}
