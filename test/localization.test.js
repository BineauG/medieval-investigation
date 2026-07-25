import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the Dead tag uses the short label requested by the board menu", () => {
  const fr = JSON.parse(fs.readFileSync(new URL("../languages/fr.json", import.meta.url), "utf8"));
  const en = JSON.parse(fs.readFileSync(new URL("../languages/en.json", import.meta.url), "utf8"));
  assert.equal(fr["medieval-investigation-toolkit"].CardTags.Dead, "Mort");
  assert.equal(en["medieval-investigation-toolkit"].CardTags.Dead, "Dead");
});
