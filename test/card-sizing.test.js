import test from "node:test";
import assert from "node:assert/strict";
import {
  loadImageAspectRatio,
  naturalImageAspectRatio,
  normalizeImageAspectRatio,
  sizeForImageAspectRatio
} from "../scripts/board/card-sizing.js";

test("document card dimensions follow a landscape reference image", () => {
  assert.deepEqual(sizeForImageAspectRatio(16 / 9, { width: 260, minimum: 120 }), {
    width: 260,
    height: 146.25
  });
});

test("very wide reference images keep their ratio and minimum height", () => {
  assert.deepEqual(sizeForImageAspectRatio(4, { width: 260, minimum: 120 }), {
    width: 480,
    height: 120
  });
});

test("image ratios are validated and can be read from the existing preview", async () => {
  assert.equal(normalizeImageAspectRatio(0), null);
  assert.equal(normalizeImageAspectRatio(Number.NaN), null);
  assert.equal(naturalImageAspectRatio({ naturalWidth: 900, naturalHeight: 600 }), 1.5);
  const preview = {
    naturalWidth: 1200,
    naturalHeight: 800,
    getAttribute: name => name === "src" ? "assets/reference.webp" : null
  };
  assert.equal(await loadImageAspectRatio("assets/reference.webp", { preview }), 1.5);
});
