// no special
export type AttributeType = "TEXT" | "NUMBER" | "SELECT" | "MULTISELECT" | "BOOLEAN";

export type AttributeDef = {
  key: string;
  label: string;
  type: AttributeType;
  options?: ReadonlyArray<{ key: string; label: string }>;
  min?: number;
  max?: number;
  maxLength?: number;
  required?: boolean;
};

export type AttributeValue = {
  key: string;
  text?: string | null;
  number?: number | null;
  bool?: boolean | null;
};

export type AttributeErrors = Record<string, string>;

export function inheritedKeys(parents: ReadonlyArray<AttributeDef[]>): AttributeDef[] {
  // Parents' attributes are available as long as the deepest category; union, child overrides duplicate keys.
  const byKey = new Map<string, AttributeDef>();
  for (const group of parents) {
    for (const def of group) byKey.set(def.key, def);
  }
  return [...byKey.values()];
}

export function validateProductAttributes(
  defs: ReadonlyArray<AttributeDef>,
  input: ReadonlyArray<AttributeValue>,
  requiredKeys: ReadonlySet<string>,
): { rows: Array<{ key: string; valueKey: string; text?: string | null; number?: number | null; bool?: boolean | null }>; errors: AttributeErrors } {
  const errors: AttributeErrors = {};
  const rows: Array<{ key: string; valueKey: string; text?: string | null; number?: number | null; bool?: boolean | null }> = [];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const valuesByKey = new Map(input.map((v) => [v.key, v]));
  for (const def of defs) {
    const field = `attributes.${def.key}`;
    const val = valuesByKey.get(def.key);
    const required = requiredKeys.has(def.key) || def.required;
    if (!val && required) {
      errors[field] = "required";
      continue;
    }
    if (!val) continue;

    if (def.type === "TEXT") {
      const text = val.text ?? "";
      if (!text.trim()) {
        if (required) errors[field] = "required";
        continue;
      }
      if (def.maxLength && text.length > def.maxLength) {
        errors[field] = "text too long";
        continue;
      }
      rows.push({ key: def.key, valueKey: text.trim(), text: text.trim() });
    } else if (def.type === "NUMBER") {
      if (val.number == null) {
        if (required) errors[field] = "required";
        continue;
      }
      if (def.min !== undefined && val.number < def.min) {
        errors[field] = "number too low";
        continue;
      }
      if (def.max !== undefined && val.number > def.max) {
        errors[field] = "number too high";
        continue;
      }
      rows.push({ key: def.key, valueKey: String(val.number), number: val.number });
    } else if (def.type === "BOOLEAN") {
      if (val.bool == null) {
        if (required) errors[field] = "required";
        continue;
      }
      rows.push({ key: def.key, valueKey: val.bool ? "true" : "false", bool: val.bool });
    } else if (def.type === "SELECT" || def.type === "MULTISELECT") {
      const text = val.text ?? "";
      const allowed = (def.options ?? []).map((o) => o.key);
      if (!allowed.includes(text)) {
        errors[field] = "invalid option";
        continue;
      }
      rows.push({ key: def.key, valueKey: text, text });
    } else {
      rows.push({ key: def.key, valueKey: "v", text: val.text ?? null });
    }
  }

  // extra values for unknown keys
  for (const v of input) {
    if (!byKey.has(v.key)) {
      errors[`attributes.${v.key}`] = "unknown attribute";
    }
  }

  return { rows, errors };
}