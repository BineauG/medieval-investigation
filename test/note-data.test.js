import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNoteText } from "../scripts/board/note-data.js";

test("note labels keep at most two normalized words", () => {
  assert.equal(normalizeNoteText("  Piste   rouge oubliée  "), "Piste rouge");
});

test("note labels are bounded for the vertical banner", () => {
  assert.equal(normalizeNoteText("A".repeat(60)).length, 40);
  assert.equal(normalizeNoteText("   "), "");
});
