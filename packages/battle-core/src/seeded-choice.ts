/** Per-decision integer hash, independent of iteration order and unrelated RNG calls. */
export function seededChoiceKey(
  seed: number,
  ...parts: readonly (string | number)[]
) {
  let h = 2166136261;
  for (const ch of JSON.stringify([seed, ...parts]))
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
