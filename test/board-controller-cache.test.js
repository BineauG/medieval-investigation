import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.js";

test("board state normalization is cached while enabled remains a direct flag read", async () => {
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: Base => class extends Base {}
      }
    }
  };
  const { BoardController } = await import("../scripts/board/board-controller.js");
  const scene = {
    flags: {
      [MODULE_ID]: {
        investigationBoard: {
          schemaVersion: 2,
          enabled: true,
          connectionsById: {
            one: { id: "one", sourceCardId: "a", targetCardId: "b" }
          }
        }
      }
    }
  };
  const controller = new BoardController();
  const first = controller.getState(scene);
  assert.strictEqual(controller.getState(scene), first);
  assert.equal(controller.isEnabled(scene), true);

  scene.flags[MODULE_ID].investigationBoard.enabled = false;
  assert.equal(controller.isEnabled(scene), false);
  controller.invalidateState(scene);
  assert.notStrictEqual(controller.getState(scene), first);
});
