import test from "node:test";
import assert from "node:assert/strict";
import { boundedTextureSize } from "../scripts/board/image-texture-cache.js";

test("large board textures are reduced without changing their ratio", () => {
  assert.deepEqual(boundedTextureSize(4096, 2048, { maxDimension: 1536, maxPixels: 1536 * 1536 }), {
    width: 1536,
    height: 768,
    scaled: true
  });
  assert.deepEqual(boundedTextureSize(800, 600, { maxDimension: 1536, maxPixels: 1536 * 1536 }), {
    width: 800,
    height: 600,
    scaled: false
  });
});
