import test from "node:test";
import assert from "node:assert/strict";
import {
  addConnection,
  createCardData,
  normalizeBoardState,
  normalizeCardTags,
  normalizeStringColor,
  removeCardConnections,
  removeConnection,
  serializeBoardState,
  validateCardData,
  validateConnection
} from "../scripts/board/board-data.js";

test("card data is normalized without copying a source document", () => {
  const card = createCardData({ cardType: "actor", sourceUuid: "Actor.abc", source: { secret: true }, text: "note" }, { userId: "u1" });
  assert.equal(card.cardType, "actor");
  assert.equal(card.sourceUuid, "Actor.abc");
  assert.equal(card.createdBy, "u1");
  assert.equal(card.text, "");
  assert.equal(Object.hasOwn(card, "source"), false);
  assert.equal(createCardData({ cardType: "free", text: "indice" }).text, "indice");
});

test("actor cards require a UUID", () => {
  const result = validateCardData({ kind: "board-card", cardType: "actor" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("card.actorUuid"));
});

test("card tags are normalized for future extension", () => {
  assert.deepEqual(normalizeCardTags(["dead", "DEAD", "unknown", null]), ["dead"]);
  assert.deepEqual(createCardData({ cardType: "document", tags: ["dead"] }).tags, ["dead"]);
});

test("connections reject self links and exact or reverse duplicates", () => {
  const ids = new Set(["a", "b"]);
  const first = addConnection({ enabled: true }, { id: "one", sourceCardId: "a", targetCardId: "b" }, ids);
  assert.equal(first.changed, true);
  const duplicate = addConnection(first.state, { id: "two", sourceCardId: "b", targetCardId: "a" }, ids);
  assert.equal(duplicate.changed, false);
  assert.ok(duplicate.errors.includes("connection.duplicate"));
  assert.equal(validateConnection({ sourceCardId: "a", targetCardId: "a" }, ids).valid, false);
});

test("deleting a card removes every incident connection", () => {
  const board = normalizeBoardState({ enabled: true, connections: [
    { id: "one", sourceCardId: "a", targetCardId: "b" },
    { id: "two", sourceCardId: "c", targetCardId: "a" },
    { id: "three", sourceCardId: "b", targetCardId: "c" }
  ]});
  const result = removeCardConnections(board, "a");
  assert.equal(result.changed, true);
  assert.deepEqual(result.state.connections.map(item => item.id), ["three"]);
});

test("a connection can be removed by id", () => {
  const result = removeConnection({ connections: [{ id: "one", sourceCardId: "a", targetCardId: "b" }] }, "one");
  assert.equal(result.changed, true);
  assert.equal(result.state.connections.length, 0);
});

test("string colors are restricted to the WFRP palette", () => {
  const palette = ["#7b1010", "#28506f", "#c39a32", "#46633b", "#613c69", "#1c1917", "#e8dfc9", "#777269", "#b65d25"];
  for (const color of palette) assert.equal(normalizeStringColor(color.toUpperCase()), color);
  assert.equal(normalizeStringColor("#ff00ff"), "#7b1010");
});

test("connections use indexed persistent storage and legacy arrays still load", () => {
  const stored = serializeBoardState({ enabled: true, connections: [
    { id: "one", sourceCardId: "a", targetCardId: "b" },
    { id: "two", sourceCardId: "b", targetCardId: "c" }
  ]});
  assert.equal(stored.schemaVersion, 2);
  assert.equal(Object.hasOwn(stored, "connections"), false);
  assert.deepEqual(Object.keys(stored.connectionsById), ["one", "two"]);
  assert.deepEqual(normalizeBoardState(stored).connections.map(connection => connection.id), ["one", "two"]);
});
