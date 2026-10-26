export function compareVersions(a: string, b: string): number {
  // ignore dev
  if (a === "dev" || b === "dev") {
    // if comparing to dev, treat as equal for gating unless explicitly required? be permissive
    if (a === "dev" && b === "dev") return 0;
    if (a === "dev") return 1; // dev is newer/equal for compatibility
    if (b === "dev") return -1;
  }
  const pa = a.split(".").map((x) => parseInt(x.replace(/[^0-9]/g, ""), 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x.replace(/[^0-9]/g, ""), 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function isOutdated(clientVersion: string | undefined, minVersion: string | undefined): boolean {
  if (!clientVersion || !minVersion) return false;
  if (clientVersion === "dev") return false;
  if (minVersion === "dev") return false;
  return compareVersions(clientVersion, minVersion) < 0;
}
