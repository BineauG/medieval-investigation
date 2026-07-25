import test from "node:test";
import assert from "node:assert/strict";
import { migrateBoard, migrateCard, migrateGraph } from "../scripts/utils/migrations.js";

test("legacy card fields migrate to schema version 2", () => {
  const card = migrateCard({ type: "actor", sourceUuid: "Actor.one", note: "old" });
  assert.equal(card.schemaVersion, 2);
  assert.equal(card.cardType, "actor");
  assert.equal(card.text, "");
  assert.deepEqual(card.tags, []);
});

test("legacy board connections are cleaned during migration", () => {
  const board = migrateBoard({ enabled: true, connections: [
    { id: "a", sourceCardId: "one", targetCardId: "two" },
    { id: "b", sourceCardId: "two", targetCardId: "one" },
    { id: "c", sourceCardId: "one", targetCardId: "missing" }
  ]}, new Set(["one", "two"]));
  assert.equal(board.schemaVersion, 2);
  assert.deepEqual(board.connections.map(item => item.id), ["a"]);
});

test("legacy faction nodes move into the faction collection", () => {
  const graph = migrateGraph({ nodes: [
    { id: "actor", kind: "actor", actorUuid: "Actor.one", width: 96, height: 126 },
    { id: "faction", kind: "faction", name: "Council" }
  ], edges: [{ id: "edge", sourceId: "actor", targetId: "faction", directed: false }] });
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.factions.length, 1);
  assert.equal(graph.schemaVersion, 4);
  assert.equal(graph.nodes[0].height, 96);
  assert.equal(graph.nodes[0].hideName, false);
  assert.equal(graph.nodes[0].hideAppearance, false);
  assert.equal(graph.nodes[0].dead, false);
  assert.deepEqual(graph.relationLabels, []);
  assert.deepEqual(graph.disabledRelationPresetKeys, []);
  assert.equal(graph.edges[0].directed, true);
  assert.equal(graph.edges[0].mutual, false);
});

test("future schemas are refused", () => {
  assert.throws(() => migrateCard({ schemaVersion: 99 }), TypeError);
  assert.throws(() => migrateBoard({ schemaVersion: 99 }), TypeError);
  assert.throws(() => migrateGraph({ schemaVersion: 99 }), TypeError);
});
