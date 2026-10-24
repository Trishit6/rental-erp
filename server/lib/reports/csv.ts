function needsQuoting(v: string): boolean {
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) return true;
  return false;
}

function escapeFormula(v: string): string {
  // check if starts with formula char after spaces
  const m = v.match(/^(\s*)([=+\-@\t\r].*)$/);
  if (m) {
    // prefix single quote to the whole string to prevent formula; keep leading spaces? safer to quote/prefix
    return "'" + v;
  }
  return v;
}

function stripControl(v: string): string {
  // strip NUL and other control chars except tab/cr/lf handled separately.
  // The control ranges are the point of the regex — sanitising untrusted CSV
  // input, not matching untrusted text — so the lint rule is disabled, not
  // the sanitisation weakened.
  /* eslint-disable no-control-regex */
  return v.replace(/\u0000/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  /* eslint-enable no-control-regex */
}

export function toCsvRow(values: unknown[], options: { isText?: boolean[] } = {}): string {
  const parts: string[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined) {
      parts.push("");
      continue;
    }
    if (typeof v === "number" || typeof v === "bigint") {
      parts.push(String(v));
      continue;
    }
    if (Object.prototype.toString.call(v) === "[object Date]") {
      parts.push((v as Date).toISOString());
      continue;
    }
    let s = String(v);
    s = stripControl(s);
    if (typeof v === "string" || (options.isText && options.isText[i])) {
      s = escapeFormula(s);
      if (needsQuoting(s) || s.startsWith("'")) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      parts.push(s);
      continue;
    }
    s = escapeFormula(s);
    if (needsQuoting(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    parts.push(s);
  }
  return parts.join(",") + "\r\n";
}

export function csvHeader(columns: string[]): string {
  // UTF-8 BOM
  return "\ufeff" + columns.map((c) => {
    let s = stripControl(String(c));
    s = escapeFormula(s);
    if (needsQuoting(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(",") + "\r\n";
}
