import test from "node:test";
import assert from "node:assert/strict";

import { createText, drawCircle, drawRoundedRect, strokePath } from "../scripts/compatibility/pixi-graphics.js";

class Pixi7GraphicsMock {
  calls = [];
  lineStyle(...args) { this.calls.push(["lineStyle", ...args]); return this; }
  beginFill(...args) { this.calls.push(["beginFill", ...args]); return this; }
  drawRoundedRect(...args) { this.calls.push(["drawRoundedRect", ...args]); return this; }
  drawCircle(...args) { this.calls.push(["drawCircle", ...args]); return this; }
  endFill() { this.calls.push(["endFill"]); return this; }
  moveTo(...args) { this.calls.push(["moveTo", ...args]); return this; }
  lineTo(...args) { this.calls.push(["lineTo", ...args]); return this; }
}

test("card graphics use the PIXI 7 drawing API exposed by Foundry 13", () => {
  const graphics = new Pixi7GraphicsMock();
  drawRoundedRect(graphics, 0, 0, 300, 400, 12,
    { color: 0xe8d5a7, alpha: 0.98 }, { color: 0x6e4c2c, width: 3, alpha: 0.9 });
  drawCircle(graphics, 20, 20, 10,
    { color: 0x8f1515, alpha: 1 }, { color: 0x4c0808, width: 2, alpha: 1 });
  strokePath(graphics, { color: 0x7b1010, width: 4, alpha: 0.75 }, target => target.moveTo(0, 0).lineTo(20, 20));

  assert.ok(graphics.calls.some(([name]) => name === "drawRoundedRect"));
  assert.ok(graphics.calls.some(([name]) => name === "drawCircle"));
  assert.deepEqual(graphics.calls.at(-3), ["lineStyle", 4, 0x7b1010, 0.75]);
  assert.deepEqual(graphics.calls.at(-2), ["moveTo", 0, 0]);
  assert.deepEqual(graphics.calls.at(-1), ["lineTo", 20, 20]);
});

test("card text uses the positional PIXI 7 constructor", () => {
  const calls = [];
  const PIXI = {
    VERSION: "7.4.3",
    Text: class { constructor(...args) { calls.push(args); } }
  };
  const style = { fontSize: 24 };
  createText(PIXI, "Altdorf", style);
  assert.deepEqual(calls, [["Altdorf", style]]);
});

test("PIXI 7 converts CSS hex connection colors to numeric strokes", () => {
  const graphics = new Pixi7GraphicsMock();
  strokePath(graphics, { color: "#7b1010", width: 5, alpha: 0.9 }, target => target.moveTo(1, 2).lineTo(3, 4));
  assert.deepEqual(graphics.calls[0], ["lineStyle", 5, 0x7b1010, 0.9]);
});
