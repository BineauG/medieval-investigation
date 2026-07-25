const MAXIMUM_NOTE_WORDS = 2;
const MAXIMUM_NOTE_CHARACTERS = 40;

/** Notes are deliberately limited to a short label suitable for a narrow
 * vertical fabric tab. Whitespace is normalized before applying the limits. */
export function normalizeNoteText(value) {
  const compact = String(value || "").replace(/\s+/gu, " ").trim();
  return compact
    .split(" ")
    .filter(Boolean)
    .slice(0, MAXIMUM_NOTE_WORDS)
    .join(" ")
    .slice(0, MAXIMUM_NOTE_CHARACTERS)
    .trim();
}
