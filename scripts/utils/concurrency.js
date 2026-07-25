function comparable(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
  }
  return value;
}

export function sameValue(left, right) {
  return comparable(left) === comparable(right);
}

/** Build a minimal optimistic update. Unchanged fields are omitted so two
 * users editing different fields can be merged by the authority. */
export function changedFields(initial = {}, next = {}, keys = []) {
  const changes = {};
  const expected = {};
  for (const key of keys) {
    if (sameValue(initial[key], next[key])) continue;
    changes[key] = next[key];
    expected[key] = initial[key];
  }
  return { changes, expected };
}

/** Return fields whose value changed since an editor was opened. */
export function conflictingFields(current = {}, expected = {}, keys = []) {
  return keys.filter(key => !Object.hasOwn(expected, key) || !sameValue(current[key], expected[key]));
}
