import test from "node:test";
import assert from "node:assert/strict";
import {
  addActorNode,
  addCustomNode,
  addEdge,
  addFaction,
  addRelationLabel,
  createEmptyGraph,
  deserializeGraph,
  removeEntity,
  removeRelationLabel,
  serializeGraph,
  setMembership,
  updateEntity,
  validateGraph
} from "../scripts/graph/relation-graph-data.js";
import { applyGraphMutation, assertGraphMutationPermission } from "../scripts/graph/relation-graph-mutations.js";

function graphFixture() {
  let graph = createEmptyGraph();
  const first = addActorNode(graph, { id: "n1", actorUuid: "Actor.one" });
  graph = first.state;
  const second = addActorNode(graph, { id: "n2", actorUuid: "Actor.two" });
  graph = second.state;
  const faction = addFaction(graph, { id: "f1", name: "Council" });
  return faction.state;
}

test("actor nodes are unique by Actor UUID", () => {
  let graph = createEmptyGraph();
  graph = addActorNode(graph, { actorUuid: "Actor.one" }).state;
  const duplicate = addActorNode(graph, { actorUuid: "Actor.one" });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.state.nodes.length, 1);
});

test("standalone nodes keep their chosen name and image and support normal relations", () => {
  let graph = createEmptyGraph();
  const standalone = addCustomNode(graph, {
    id: "custom",
    name: "La Couronne",
    image: "worlds/campaign/assets/crown.webp"
  });
  graph = standalone.state;
  graph = addActorNode(graph, { id: "actor", actorUuid: "Actor.one" }).state;
  graph = addEdge(graph, { sourceId: "custom", targetId: "actor", label: "Influence" }).state;

  const restored = deserializeGraph(serializeGraph(graph));
  assert.equal(restored.nodes[0].actorUuid, "");
  assert.equal(restored.nodes[0].nameOverride, "La Couronne");
  assert.equal(restored.nodes[0].imageOverride, "worlds/campaign/assets/crown.webp");
  assert.equal(restored.edges[0].sourceId, "custom");
  assert.throws(() => addCustomNode(graph, { name: "", image: "image.webp" }), /requires a name/u);
  assert.throws(() => addCustomNode(graph, { name: "Sans image", image: "" }), /requires an image/u);
});

test("actor privacy and dead-state flags and mutual relations survive normalization", () => {
  let graph = createEmptyGraph();
  graph = addActorNode(graph, { id: "n1", actorUuid: "Actor.one", hideName: true, hideAppearance: true, dead: true }).state;
  graph = addActorNode(graph, { id: "n2", actorUuid: "Actor.two" }).state;
  graph = addEdge(graph, { sourceId: "n1", targetId: "n2", mutual: true }).state;
  assert.equal(graph.nodes[0].hideName, true);
  assert.equal(graph.nodes[0].hideAppearance, true);
  assert.equal(graph.nodes[0].dead, true);
  assert.equal(graph.nodes[1].dead, false);
  assert.equal(graph.edges[0].mutual, true);
});

test("the GM can override a graph node display name without changing its source cache", () => {
  let graph = createEmptyGraph();
  graph = addActorNode(graph, { id: "n1", actorUuid: "Actor.one", cachedName: "Source name" }).state;
  const updated = updateEntity(graph, "n1", { nameOverride: "Displayed name" }).state;
  assert.equal(updated.nodes[0].nameOverride, "Displayed name");
  assert.equal(updated.nodes[0].cachedName, "Source name");
});

test("membership is explicit and synchronized both ways", () => {
  const graph = setMembership(graphFixture(), "n1", "f1", true).state;
  assert.deepEqual(graph.nodes.find(node => node.id === "n1").factionIds, ["f1"]);
  assert.deepEqual(graph.factions.find(faction => faction.id === "f1").memberNodeIds, ["n1"]);
});

test("a character can belong to multiple factions", () => {
  let graph = graphFixture();
  graph = addFaction(graph, { id: "f2", name: "Guild" }).state;
  graph = setMembership(graph, "n1", "f1", true).state;
  graph = setMembership(graph, "n1", "f2", true).state;
  assert.deepEqual(new Set(graph.nodes[0].factionIds), new Set(["f1", "f2"]));
});

test("removing an entity cleans edges and memberships", () => {
  let graph = graphFixture();
  graph = setMembership(graph, "n1", "f1", true).state;
  graph = addEdge(graph, { id: "e1", sourceId: "n1", targetId: "f1", label: "works for", directed: true }).state;
  graph = addEdge(graph, { id: "e2", sourceId: "n2", targetId: "f1" }).state;
  const removed = removeEntity(graph, "n1").state;
  assert.equal(removed.edges.some(edge => edge.id === "e1"), false);
  assert.equal(removed.edges.some(edge => edge.id === "e2"), true);
  assert.deepEqual(removed.factions[0].memberNodeIds, []);
});

test("relations accept every actor/faction endpoint combination", () => {
  let graph = graphFixture();
  graph = addEdge(graph, { sourceId: "n1", targetId: "n2" }).state;
  graph = addEdge(graph, { sourceId: "n1", targetId: "f1" }).state;
  graph = addEdge(graph, { sourceId: "f1", targetId: "n2" }).state;
  const other = addFaction(graph, { id: "f2", name: "Guild" });
  graph = addEdge(other.state, { sourceId: "f1", targetId: "f2" }).state;
  assert.equal(graph.edges.length, 4);
  assert.equal(graph.edges.every(edge => edge.directed), true);
});

test("serialization and deserialization validate graph JSON", () => {
  const graph = graphFixture();
  const restored = deserializeGraph(serializeGraph(graph));
  assert.deepEqual(restored, graph);
  assert.throws(() => deserializeGraph("{"), SyntaxError);
  assert.equal(validateGraph({ nodes: "bad" }).valid, false);
});

test("custom relation labels persist alphabetically with their base color and delete matching edges", () => {
  let graph = graphFixture();
  graph = addRelationLabel(graph, { id: "z", label: "Zèle", color: "#6A1B9A" }).state;
  graph = addRelationLabel(graph, { id: "a", label: "Accuse", color: "#B3261E" }).state;
  graph = addEdge(graph, { id: "matching", sourceId: "n1", targetId: "n2", label: "accuse" }).state;
  graph = addEdge(graph, { id: "other", sourceId: "n2", targetId: "n1", label: "Ami" }).state;

  assert.deepEqual(graph.relationLabels.map(entry => entry.label), ["Accuse", "Zèle"]);
  assert.equal(graph.relationLabels[0].color, "#B3261E");
  const removed = removeRelationLabel(graph, { id: "a", label: "Accuse" });
  assert.equal(removed.removedEdges, 1);
  assert.deepEqual(removed.state.relationLabels.map(entry => entry.label), ["Zèle"]);
  assert.deepEqual(removed.state.edges.map(edge => edge.id), ["other"]);

  const hiddenPreset = removeRelationLabel(removed.state, { key: "friend", label: "Ami" }).state;
  assert.deepEqual(hiddenPreset.disabledRelationPresetKeys, ["friend"]);
  assert.equal(hiddenPreset.edges.length, 0);
  assert.deepEqual(deserializeGraph(serializeGraph(hiddenPreset)), hiddenPreset);
});

test("collaborative mutations merge independent player changes and reject only stale fields", () => {
  let current = graphFixture();
  current = setMembership(current, "n1", "f1", true).state;
  current = addEdge(current, { id: "edge", sourceId: "n1", targetId: "n2", label: "Ami" }).state;

  const player = { id: "player", active: true, isGM: false };
  const move = {
    kind: "moveEntities",
    entries: [{ entityId: "n1", changes: { x: 440, y: 300 }, expected: { x: 400, y: 300 } }]
  };
  const edgeEdit = {
    kind: "updateEdge",
    edgeId: "edge",
    changes: { label: "Rival de", style: { color: "#B3261E", width: 4, lineStyle: "solid" } },
    expected: { label: "Ami", style: current.edges[0].style }
  };
  assert.equal(assertGraphMutationPermission(player, current, move), true);
  assert.equal(assertGraphMutationPermission(player, current, edgeEdit), true);

  let merged = applyGraphMutation(current, move).graph;
  merged = applyGraphMutation(merged, edgeEdit).graph;
  assert.equal(merged.nodes.find(node => node.id === "n1").x, 440);
  assert.equal(merged.edges[0].label, "Rival de");
  assert.equal(merged.edges[0].style.color, "#B3261E");

  const staleMove = {
    kind: "moveEntities",
    entries: [{ entityId: "n1", changes: { x: 480 }, expected: { x: 400 } }]
  };
  assert.throws(() => applyGraphMutation(merged, staleMove), /GraphConflict/u);
  assert.throws(() => assertGraphMutationPermission(player, current, {
    kind: "updateEntity", entityId: "n1", changes: { dead: true }, expected: { dead: false }
  }), /PermissionDenied/u);
  assert.throws(() => assertGraphMutationPermission(player, current, {
    kind: "updateEntity", entityId: "f1", changes: { name: "Changed" }, expected: { name: "Council" }
  }), /PermissionDenied/u);
  assert.throws(() => assertGraphMutationPermission(player, current, {
    kind: "addCustomNode", node: { name: "Forbidden", image: "forbidden.webp" }
  }), /PermissionDenied/u);
});

test("player movement adds automatic faction membership only after the authoritative mutation", () => {
  const player = { id: "player", active: true, isGM: false };
  const current = graphFixture();
  const mutation = {
    kind: "moveEntities",
    addMemberships: true,
    entries: [{ entityId: "n1", changes: { x: 450, y: 320 }, expected: { x: 400, y: 300 } }]
  };
  assert.equal(assertGraphMutationPermission(player, current, mutation), true);
  const moved = applyGraphMutation(current, mutation).graph;
  assert.deepEqual(moved.nodes.find(node => node.id === "n1").factionIds, ["f1"]);
  assert.deepEqual(moved.factions.find(faction => faction.id === "f1").memberNodeIds, ["n1"]);
});

test("players can create, edit and remove links through atomic mutations", () => {
  const player = { id: "player", active: true, isGM: false };
  let graph = graphFixture();
  const create = {
    kind: "addEdge",
    edge: { id: "player-edge", sourceId: "n1", targetId: "n2", label: "Ami" },
    newRelationLabel: { id: "friend-label", label: "Ami", color: "#2E7D32" }
  };
  assert.equal(assertGraphMutationPermission(player, graph, create), true);
  graph = applyGraphMutation(graph, create).graph;
  const update = {
    kind: "updateEdge",
    edgeId: "player-edge",
    changes: { label: "Rival de" },
    expected: { label: "Ami" }
  };
  assert.equal(assertGraphMutationPermission(player, graph, update), true);
  graph = applyGraphMutation(graph, update).graph;
  assert.equal(graph.edges[0].label, "Rival de");
  const remove = { kind: "removeEdge", edgeId: "player-edge" };
  assert.equal(assertGraphMutationPermission(player, graph, remove), true);
  graph = applyGraphMutation(graph, remove).graph;
  assert.equal(graph.edges.length, 0);
});
