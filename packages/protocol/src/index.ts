export type Path = (string | number)[];
export type Change =
  { path: Path; value: unknown } | { path: Path; remove: true };
export type StateDelta = {
  baseTick: number;
  tick: number;
  hash: string;
  changes: Change[];
};

/** Replace arrays only when their shape changes; otherwise patch individual fields. */
export function diffState(before: unknown, after: unknown): Change[] {
  const changes: Change[] = [];
  const walk = (a: unknown, b: unknown, path: Path) => {
    if (Object.is(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      b.forEach((v, i) => walk(a[i], v, [...path, i]));
    } else if (
      a !== null &&
      b !== null &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      const old = a as Record<string, unknown>,
        current = b as Record<string, unknown>;
      for (const key of Object.keys(old))
        if (!(key in current))
          changes.push({ path: [...path, key], remove: true });
      for (const key of Object.keys(current))
        if (key in old) walk(old[key], current[key], [...path, key]);
        else changes.push({ path: [...path, key], value: current[key] });
    } else changes.push({ path, value: b });
  };
  walk(before, after, []);
  return changes;
}

export function applyStateDelta<T>(base: T, changes: Change[]): T {
  let result = structuredClone(base);
  for (const change of changes) {
    if (change.path.length === 0) {
      if ("remove" in change) throw new Error("Cannot remove root state");
      result = structuredClone(change.value) as T;
      continue;
    }
    let parent: any = result;
    for (const key of change.path.slice(0, -1)) {
      if (parent == null || !(key in parent))
        throw new Error("Invalid delta path");
      parent = parent[key];
    }
    const key = change.path.at(-1)!;
    if (parent == null || (!(key in parent) && "remove" in change))
      throw new Error("Invalid delta removal");
    if ("remove" in change) delete parent[key];
    else parent[key] = structuredClone(change.value);
  }
  return result;
}
