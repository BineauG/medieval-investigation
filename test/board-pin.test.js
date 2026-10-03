import test from "node:test";
import assert from "node:assert/strict";
import { boardPinSize } from "../scripts/board/board-pin.js";

test("wax seal size follows the configured scale", () => {
  assert.ok(Math.abs(boardPinSize(220) - 37.4) < Number.EPSILON * 100);
  assert.ok(Math.abs(boardPinSize(220, 0.5) - 18.7) < Number.EPSILON * 100);
  assert.ok(Math.abs(boardPinSize(220, 2) - 74.8) < Number.EPSILON * 100);
});

test("wax seal scale is bounded and invalid values use the default", () => {
  assert.equal(boardPinSize(220, 0.1), boardPinSize(220, 0.5));
  assert.equal(boardPinSize(220, 5), boardPinSize(220, 2));
  assert.equal(boardPinSize(220, "invalid"), boardPinSize(220));
});
