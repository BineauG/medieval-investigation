import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Almendra SC is bundled locally with its license and CSS registration", () => {
  const font = fs.readFileSync(new URL("../assets/fonts/AlmendraSC-Regular.ttf", import.meta.url));
  const license = fs.readFileSync(new URL("../assets/fonts/OFL.txt", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/medieval-investigation-toolkit.css", import.meta.url), "utf8");
  assert.deepEqual([...font.subarray(0, 4)], [0x00, 0x01, 0x00, 0x00]);
  assert.match(license, /SIL Open Font License, Version 1\.1/u);
  assert.match(css, /font-family: "Almendra SC"/u);
  assert.match(css, /assets\/fonts\/AlmendraSC-Regular\.ttf/u);
});
