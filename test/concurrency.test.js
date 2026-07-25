import test from "node:test";
import assert from "node:assert/strict";
import { changedFields, conflictingFields } from "../scripts/utils/concurrency.js";
import { SocketService } from "../scripts/board/board-sockets.js";

test("concurrent editors only send fields they actually changed", () => {
  const first = changedFields(
    { titleOverride: "Old", tags: [] },
    { titleOverride: "New", tags: [] },
    ["titleOverride", "tags"]
  );
  const second = changedFields(
    { titleOverride: "Old", tags: [] },
    { titleOverride: "Old", tags: ["dead"] },
    ["titleOverride", "tags"]
  );
  assert.deepEqual(first, { changes: { titleOverride: "New" }, expected: { titleOverride: "Old" } });
  assert.deepEqual(second, { changes: { tags: ["dead"] }, expected: { tags: [] } });
});

test("optimistic conflicts are detected per field", () => {
  assert.deepEqual(conflictingFields(
    { titleOverride: "Other", tags: [] },
    { titleOverride: "Old" },
    ["titleOverride"]
  ), ["titleOverride"]);
  assert.deepEqual(conflictingFields(
    { titleOverride: "Other", tags: ["dead"] },
    { tags: [] },
    ["tags"]
  ), ["tags"]);
  assert.deepEqual(conflictingFields(
    { titleOverride: "Other", tags: ["dead"] },
    { tags: ["dead"] },
    ["tags"]
  ), []);
});

test("the authority serializes automatic operations without manual approval", async () => {
  const gm = { id: "gm", active: true, isGM: true };
  globalThis.game = {
    user: gm,
    users: { contents: [gm] },
    socket: { on() {}, emit() {} }
  };
  const service = new SocketService();
  const events = [];
  let active = 0;
  let maximumActive = 0;
  service.register(async (_operation, payload) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    events.push(`start-${payload.order}`);
    await new Promise(resolve => setTimeout(resolve, 5));
    events.push(`end-${payload.order}`);
    active -= 1;
    return payload.order;
  });

  const results = await Promise.all([
    service.request("board.updateCard", { order: 1 }),
    service.request("board.updateCard", { order: 2 }),
    service.request("board.updateConnection", { order: 3 })
  ]);
  assert.deepEqual(results, [1, 2, 3]);
  assert.equal(maximumActive, 1);
  assert.deepEqual(events, ["start-1", "end-1", "start-2", "end-2", "start-3", "end-3"]);
});
