import test from "node:test";
import assert from "node:assert/strict";

test("module entry point registers init and ready hooks against v13/v14 API surface", async () => {
  const callbacks = { once: new Map(), on: new Map() };
  globalThis.Hooks = {
    once(name, callback) { callbacks.once.set(name, callback); },
    on(name, callback) { callbacks.on.set(name, callback); },
    callAll() {}
  };
  class ApplicationV2 {
    constructor() { this.options = {}; }
  }
  class Drawing {}
  const instances = new Map();
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2,
        HandlebarsApplicationMixin: Base => class extends Base {},
        DialogV2: { confirm: async () => true, input: async () => null }
      },
      apps: { FilePicker: class extends ApplicationV2 {} },
      instances
    },
    documents: { JournalEntry: class {} },
    canvas: { placeables: { Drawing } },
    utils: { randomID: () => "mock-id" }
  };
  globalThis.CONFIG = { Drawing: { objectClass: Drawing } };
  const registered = new Set();
  const moduleRecord = {};
  globalThis.game = {
    settings: {
      register(_module, name) { registered.add(name); },
      registerMenu(_module, name) { registered.add(name); },
      get() { return false; }
    },
    socket: { on() {} },
    modules: new Map([["medieval-investigation-toolkit", moduleRecord]])
  };
  globalThis.document = { addEventListener() {} };
  await import(`../scripts/main.js?test=${Date.now()}`);
  assert.equal(typeof callbacks.once.get("init"), "function");
  assert.equal(typeof callbacks.once.get("ready"), "function");
  callbacks.once.get("init")();
  assert.equal(CONFIG.Drawing.objectClass.mitBoardDrawingClass, true);
  callbacks.once.get("setup")();
  callbacks.once.get("ready")();
  globalThis.canvas = { scene: null };
  game.user = { isGM: true };
  const sceneControls = { drawings: { tools: {} }, notes: { tools: {} } };
  callbacks.on.get("getSceneControlButtons")(sceneControls);
  assert.ok(registered.has("cardScale"));
  assert.ok(registered.has("noteTextDirection"));
  assert.ok(registered.has("noteBannerImage"));
  assert.ok(registered.has("deathOverlayOpacity"));
  assert.equal(registered.has("deathTagImage"), false);
  assert.equal(registered.has("playersCreateCards"), false);
  assert.equal(registered.has("playersEditGraph"), false);
  assert.ok(registered.has("assetSettings"));
  assert.equal(typeof callbacks.on.get("getActorContextOptions"), "function");
  assert.equal(typeof callbacks.on.get("getItemContextOptions"), "function");
  assert.equal(typeof callbacks.on.get("getJournalEntryPageContextOptions"), "function");
  assert.equal(typeof callbacks.on.get("renderTokenHUD"), "function");
  assert.equal(typeof callbacks.on.get("renderActorSheetWFRP4eCharacter"), "function");
  assert.equal(typeof callbacks.on.get("renderJournalPageSheet"), "function");
  assert.equal(sceneControls.notes.tools.mitRelationGraph?.name, "mitRelationGraph");
  assert.equal(sceneControls.drawings.tools.mitRelationGraph, undefined);
  assert.equal(typeof moduleRecord.api.openRelationGraph, "function");
  assert.equal(typeof moduleRecord.api.createCard, "function");
});
