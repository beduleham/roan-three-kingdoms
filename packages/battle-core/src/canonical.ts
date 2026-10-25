/** Canonical JSON for JSON-compatible simulation state. Arrays retain semantic order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error("Not a JSON value");
    return result;
  }
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key]))
      .join(",") +
    "}"
  );
}
