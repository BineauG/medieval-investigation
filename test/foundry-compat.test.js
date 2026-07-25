import test from "node:test";
import assert from "node:assert/strict";

import { applicationClasses, drawingData, ensureDataDirectory } from "../scripts/compatibility/foundry-version.js";

test("board cards use a valid, practically invisible Foundry v13 Drawing", () => {
  globalThis.CONST = {
    DRAWING_TYPES: { RECTANGLE: "r" },
    DRAWING_FILL_TYPES: { NONE: 0, SOLID: 1 }
  };

  const data = drawingData({
    x: 10,
    y: 20,
    width: 300,
    height: 420,
    z: 7,
    flags: { kind: "board-card" }
  });

  assert.equal(data.fillType, 1);
  assert.ok(data.fillAlpha > 0);
  assert.equal(data.strokeWidth, 0);
  assert.equal(data.elevation, 7);
  assert.equal(data.sort, 7);
  assert.deepEqual(data.shape, { type: "r", width: 300, height: 420 });
});

test("Foundry v13 FilePicker uses its registered implementation and creates nested asset directories", async () => {
  class FilePickerImplementation {
    static directories = new Set(["assets"]);

    static async browse(_source, path) {
      if (!this.directories.has(path)) throw new Error("missing");
    }

    static async createDirectory(_source, path) {
      this.directories.add(path);
    }
  }
  globalThis.foundry = {
    applications: {
      api: { ApplicationV2: class {}, HandlebarsApplicationMixin: value => value },
      apps: { FilePicker: { implementation: FilePickerImplementation } }
    }
  };

  assert.equal(applicationClasses().FilePicker, FilePickerImplementation);
  await ensureDataDirectory("assets/medieval-investigation-toolkit/pins");
  await ensureDataDirectory("assets/medieval-investigation-toolkit/notes");
  assert.ok(FilePickerImplementation.directories.has("assets/medieval-investigation-toolkit"));
  assert.ok(FilePickerImplementation.directories.has("assets/medieval-investigation-toolkit/pins"));
  assert.ok(FilePickerImplementation.directories.has("assets/medieval-investigation-toolkit/notes"));
});
