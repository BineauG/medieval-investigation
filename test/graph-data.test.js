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
import { mergePlayerGraphChanges } from "../scripts/graph/relation-graph-store.js";

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

test("player graph saves may edit links and delete nodes but cannot alter retained nodes or factions", () => {
  let current = graphFixture();
  current = setMembership(current, "n1", "f1", true).state;
  current = addEdge(current, { id: "edge", sourceId: "n1", targetId: "n2", label: "Ami" }).state;

  const edgeEdit = structuredClone(current);
  edgeEdit.edges[0].label = "Rival de";
  edgeEdit.edges[0].style.color = "#B3261E";
  const mergedEdge = mergePlayerGraphChanges(current, edgeEdit);
  assert.equal(mergedEdge.edges[0].label, "Rival de");
  assert.equal(mergedEdge.edges[0].style.color, "#B3261E");

  const withCustomLabel = addRelationLabel(current, { label: "Soupçonne", color: "#C65D00" }).state;
  const mergedLabel = mergePlayerGraphChanges(current, withCustomLabel);
  assert.equal(mergedLabel.relationLabels[0].label, "Soupçonne");
  assert.equal(mergedLabel.relationLabels[0].color, "#C65D00");

  const deletion = removeEntity(current, "n1").state;
  const mergedDeletion = mergePlayerGraphChanges(current, deletion);
  assert.equal(mergedDeletion.nodes.some(node => node.id === "n1"), false);
  assert.equal(mergedDeletion.edges.length, 0);
  assert.deepEqual(mergedDeletion.factions[0].memberNodeIds, []);

  const movedNode = structuredClone(current);
  movedNode.nodes[0].x += 40;
  assert.throws(() => mergePlayerGraphChanges(current, movedNode), /PermissionDenied/u);

  const markedDead = structuredClone(current);
  markedDead.nodes[0].dead = true;
  assert.throws(() => mergePlayerGraphChanges(current, markedDead), /PermissionDenied/u);

  const editedFaction = structuredClone(current);
  editedFaction.factions[0].name = "Changed";
  assert.throws(() => mergePlayerGraphChanges(current, editedFaction), /PermissionDenied/u);

  const addedStandalone = addCustomNode(current, { name: "Forbidden", image: "forbidden.webp" }).state;
  assert.throws(() => mergePlayerGraphChanges(current, addedStandalone), /PermissionDenied/u);
});
