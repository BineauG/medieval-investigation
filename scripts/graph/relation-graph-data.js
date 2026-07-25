import {
  DEFAULT_EDGE_STYLE,
  DEFAULT_FACTION_STYLE,
  DEFAULT_NODE_SIZE,
  GRAPH_ID,
  GRAPH_SCHEMA_VERSION,
  RELATION_PRESETS
} from "../constants.js";
import { randomId } from "../utils/ids.js";

const SHAPES = new Set(["rounded-rectangle", "ellipse", "polygon"]);
const LINE_STYLES = new Set(["solid", "dashed", "dotted"]);
const RELATION_PRESET_KEYS = new Set(RELATION_PRESETS.map(preset => preset.key));

const clone = value => globalThis.structuredClone
  ? globalThis.structuredClone(value)
  : JSON.parse(JSON.stringify(value));

const str = (value, max = 20_000) => typeof value === "string" ? value.slice(0, max) : "";
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback, minimum = 1) => Math.max(minimum, num(value, fallback));
const color = (value, fallback) => /^#[0-9a-f]{6}$/iu.test(value || "") ? value : fallback;
const normalizedLabel = value => str(value, 500).trim().normalize("NFKC").toLocaleLowerCase();

export function createEmptyGraph(input = {}) {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    revision: Math.max(0, Math.floor(num(input.revision, 0))),
    id: str(input.id, 100) || GRAPH_ID,
    name: str(input.name, 500) || "Relations",
    viewport: {
      x: num(input.viewport?.x, 0),
      y: num(input.viewport?.y, 0),
      zoom: Math.min(4, Math.max(0.15, num(input.viewport?.zoom, 1)))
    },
    relationLabels: [],
    disabledRelationPresetKeys: [],
    nodes: [],
    factions: [],
    edges: []
  };
}

export function normalizeActorNode(input = {}) {
  return {
    id: str(input.id, 100) || randomId(),
    kind: "actor",
    actorUuid: str(input.actorUuid, 1_000),
    x: num(input.x, 400),
    y: num(input.y, 300),
    width: positive(input.width, DEFAULT_NODE_SIZE.width, 48),
    height: positive(input.height, DEFAULT_NODE_SIZE.height, 60),
    nameOverride: str(input.nameOverride, 500),
    imageOverride: str(input.imageOverride, 2_000),
    cachedName: str(input.cachedName, 500),
    cachedImage: str(input.cachedImage, 2_000),
    hideName: Boolean(input.hideName),
    hideAppearance: Boolean(input.hideAppearance),
    dead: Boolean(input.dead),
    factionIds: [...new Set((Array.isArray(input.factionIds) ? input.factionIds : []).map(id => str(id, 100)).filter(Boolean))]
  };
}

export function normalizeFaction(input = {}) {
  const shape = SHAPES.has(input.shape) ? input.shape : "rounded-rectangle";
  return {
    id: str(input.id, 100) || randomId(),
    kind: "faction",
    name: str(input.name, 500),
    description: str(input.description),
    shape,
    x: num(input.x, 200),
    y: num(input.y, 150),
    width: positive(input.width, 500, 100),
    height: positive(input.height, 350, 80),
    points: Array.isArray(input.points)
      ? input.points.slice(0, 100).map(point => ({ x: num(point?.x), y: num(point?.y) }))
      : [],
    style: {
      fill: color(input.style?.fill, DEFAULT_FACTION_STYLE.fill),
      fillOpacity: Math.min(1, Math.max(0, num(input.style?.fillOpacity, DEFAULT_FACTION_STYLE.fillOpacity))),
      stroke: color(input.style?.stroke, DEFAULT_FACTION_STYLE.stroke),
      strokeWidth: Math.min(20, positive(input.style?.strokeWidth, DEFAULT_FACTION_STYLE.strokeWidth))
    },
    z: num(input.z, 0),
    memberNodeIds: [...new Set((Array.isArray(input.memberNodeIds) ? input.memberNodeIds : []).map(id => str(id, 100)).filter(Boolean))]
  };
}

export function normalizeEdge(input = {}) {
  return {
    id: str(input.id, 100) || randomId(),
    sourceId: str(input.sourceId, 100),
    targetId: str(input.targetId, 100),
    label: str(input.label, 1_000),
    directed: true,
    mutual: Boolean(input.mutual),
    labelPosition: Math.min(0.9, Math.max(0.1, num(input.labelPosition, 0.5))),
    style: {
      color: color(input.style?.color, DEFAULT_EDGE_STYLE.color),
      width: Math.min(20, positive(input.style?.width, DEFAULT_EDGE_STYLE.width)),
      lineStyle: LINE_STYLES.has(input.style?.lineStyle) ? input.style.lineStyle : DEFAULT_EDGE_STYLE.lineStyle
    }
  };
}

export function normalizeRelationLabel(input = {}) {
  return {
    id: str(input.id, 100) || randomId(),
    label: str(input.label, 500).trim(),
    color: color(input.color, DEFAULT_EDGE_STYLE.color)
  };
}

export function normalizeGraph(input = {}) {
  const graph = createEmptyGraph(input);
  const relationLabelIds = new Set();
  const relationLabelNames = new Set();
  for (const candidate of (Array.isArray(input.relationLabels) ? input.relationLabels : []).slice(0, 200)) {
    const relationLabel = normalizeRelationLabel(candidate);
    const name = normalizedLabel(relationLabel.label);
    if (!name || relationLabelIds.has(relationLabel.id) || relationLabelNames.has(name)) continue;
    relationLabelIds.add(relationLabel.id);
    relationLabelNames.add(name);
    graph.relationLabels.push(relationLabel);
  }
  graph.relationLabels.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  graph.disabledRelationPresetKeys = [...new Set(
    (Array.isArray(input.disabledRelationPresetKeys) ? input.disabledRelationPresetKeys : [])
      .map(key => str(key, 100))
      .filter(key => RELATION_PRESET_KEYS.has(key))
  )];
  const nodeIds = new Set();
  for (const candidate of Array.isArray(input.nodes) ? input.nodes : []) {
    const node = normalizeActorNode(candidate);
    const hasActor = Boolean(node.actorUuid);
    const isStandalone = !hasActor && Boolean(node.nameOverride && node.imageOverride);
    if ((!hasActor && !isStandalone) || nodeIds.has(node.id)) continue;
    nodeIds.add(node.id);
    graph.nodes.push(node);
  }
  const factionIds = new Set();
  for (const candidate of Array.isArray(input.factions) ? input.factions : []) {
    const faction = normalizeFaction(candidate);
    if (!faction.name || factionIds.has(faction.id) || nodeIds.has(faction.id)) continue;
    factionIds.add(faction.id);
    graph.factions.push(faction);
  }
  const allIds = new Set([...nodeIds, ...factionIds]);
  const edges = new Set();
  for (const candidate of Array.isArray(input.edges) ? input.edges : []) {
    const edge = normalizeEdge(candidate);
    if (!allIds.has(edge.sourceId) || !allIds.has(edge.targetId) || edge.sourceId === edge.targetId || edges.has(edge.id)) continue;
    edges.add(edge.id);
    graph.edges.push(edge);
  }
  for (const node of graph.nodes) node.factionIds = node.factionIds.filter(id => factionIds.has(id));
  for (const faction of graph.factions) faction.memberNodeIds = faction.memberNodeIds.filter(id => nodeIds.has(id));
  synchronizeMemberships(graph);
  return graph;
}

export function validateGraph(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) errors.push("graph.object");
  if (input?.nodes !== undefined && !Array.isArray(input.nodes)) errors.push("graph.nodes");
  if (input?.factions !== undefined && !Array.isArray(input.factions)) errors.push("graph.factions");
  if (input?.edges !== undefined && !Array.isArray(input.edges)) errors.push("graph.edges");
  if (input?.relationLabels !== undefined && !Array.isArray(input.relationLabels)) errors.push("graph.relationLabels");
  if (input?.disabledRelationPresetKeys !== undefined && !Array.isArray(input.disabledRelationPresetKeys)) errors.push("graph.disabledRelationPresetKeys");
  const value = normalizeGraph(input && typeof input === "object" ? input : {});
  return { valid: errors.length === 0, errors, value };
}

export function addActorNode(graph, actor = {}) {
  const state = normalizeGraph(graph);
  const actorUuid = str(actor.actorUuid || actor.uuid, 1_000);
  if (!actorUuid) throw new TypeError("actorUuid is required");
  const existing = state.nodes.find(node => node.actorUuid === actorUuid);
  if (existing) return { state, node: existing, changed: false };
  const node = normalizeActorNode({ ...actor, actorUuid });
  state.nodes.push(node);
  return { state, node, changed: true };
}

export function addCustomNode(graph, input = {}) {
  const state = normalizeGraph(graph);
  const name = str(input.nameOverride ?? input.name, 500).trim();
  const image = str(input.imageOverride ?? input.image, 2_000).trim();
  if (!name) throw new TypeError("A custom graph node requires a name.");
  if (!image) throw new TypeError("A custom graph node requires an image.");

  const node = normalizeActorNode({
    ...input,
    actorUuid: "",
    nameOverride: name,
    imageOverride: image,
    cachedName: "",
    cachedImage: ""
  });
  const occupiedIds = new Set([
    ...state.nodes.map(entry => entry.id),
    ...state.factions.map(entry => entry.id)
  ]);
  if (occupiedIds.has(node.id)) node.id = randomId();
  state.nodes.push(node);
  return { state, node, changed: true };
}

export function addFaction(graph, input = {}) {
  const state = normalizeGraph(graph);
  const faction = normalizeFaction(input);
  if (!faction.name) throw new TypeError("faction name is required");
  if (state.nodes.some(node => node.id === faction.id) || state.factions.some(item => item.id === faction.id)) {
    faction.id = randomId();
  }
  state.factions.push(faction);
  synchronizeMemberships(state);
  return { state, faction };
}

export function addEdge(graph, input = {}) {
  const state = normalizeGraph(graph);
  const edge = normalizeEdge(input);
  const allIds = new Set([...state.nodes.map(node => node.id), ...state.factions.map(faction => faction.id)]);
  if (!allIds.has(edge.sourceId) || !allIds.has(edge.targetId)) throw new TypeError("edge endpoints are required");
  if (edge.sourceId === edge.targetId) throw new TypeError("self edges are not supported");
  state.edges.push(edge);
  return { state, edge };
}

export function addRelationLabel(graph, input = {}) {
  const state = normalizeGraph(graph);
  const relationLabel = normalizeRelationLabel(input);
  const name = normalizedLabel(relationLabel.label);
  if (!name) throw new TypeError("relation label is required");
  const existing = state.relationLabels.find(entry => normalizedLabel(entry.label) === name);
  if (existing) return { state, relationLabel: existing, changed: false };
  if (state.relationLabels.some(entry => entry.id === relationLabel.id)) relationLabel.id = randomId();
  state.relationLabels.push(relationLabel);
  state.relationLabels.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  return { state, relationLabel, changed: true };
}

export function removeRelationLabel(graph, input = {}) {
  const state = normalizeGraph(graph);
  const id = str(input.id, 100);
  const key = str(input.key, 100);
  const stored = id ? state.relationLabels.find(entry => entry.id === id) : null;
  const label = str(input.label || stored?.label, 500).trim();
  const name = normalizedLabel(label);
  const beforeLabels = state.relationLabels.length;
  const beforeDisabled = state.disabledRelationPresetKeys.length;
  const beforeEdges = state.edges.length;

  if (id) state.relationLabels = state.relationLabels.filter(entry => entry.id !== id);
  else if (name && !key) state.relationLabels = state.relationLabels.filter(entry => normalizedLabel(entry.label) !== name);
  if (key && RELATION_PRESET_KEYS.has(key) && !state.disabledRelationPresetKeys.includes(key)) {
    state.disabledRelationPresetKeys.push(key);
  }
  if (name) state.edges = state.edges.filter(edge => normalizedLabel(edge.label) !== name);

  return {
    state,
    changed: beforeLabels !== state.relationLabels.length
      || beforeDisabled !== state.disabledRelationPresetKeys.length
      || beforeEdges !== state.edges.length,
    removedEdges: beforeEdges - state.edges.length
  };
}

export function removeEntity(graph, entityId) {
  const state = normalizeGraph(graph);
  const before = state.nodes.length + state.factions.length;
  state.nodes = state.nodes.filter(node => node.id !== entityId);
  state.factions = state.factions.filter(faction => faction.id !== entityId);
  state.edges = state.edges.filter(edge => edge.sourceId !== entityId && edge.targetId !== entityId);
  for (const node of state.nodes) node.factionIds = node.factionIds.filter(id => id !== entityId);
  for (const faction of state.factions) faction.memberNodeIds = faction.memberNodeIds.filter(id => id !== entityId);
  synchronizeMemberships(state);
  return { state, changed: before !== state.nodes.length + state.factions.length };
}

export function removeEdge(graph, edgeId) {
  const state = normalizeGraph(graph);
  const before = state.edges.length;
  state.edges = state.edges.filter(edge => edge.id !== edgeId);
  return { state, changed: before !== state.edges.length };
}

export function setMembership(graph, nodeId, factionId, member = true) {
  const state = normalizeGraph(graph);
  const node = state.nodes.find(item => item.id === nodeId);
  const faction = state.factions.find(item => item.id === factionId);
  if (!node || !faction) throw new TypeError("membership endpoints are required");
  const nodeSet = new Set(node.factionIds);
  const factionSet = new Set(faction.memberNodeIds);
  if (member) {
    nodeSet.add(factionId);
    factionSet.add(nodeId);
  } else {
    nodeSet.delete(factionId);
    factionSet.delete(nodeId);
  }
  node.factionIds = [...nodeSet];
  faction.memberNodeIds = [...factionSet];
  return { state, node, faction };
}

export function synchronizeMemberships(graph) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const factions = new Map(graph.factions.map(faction => [faction.id, faction]));
  for (const node of nodes.values()) {
    node.factionIds = [...new Set(node.factionIds)].filter(id => factions.has(id));
    for (const factionId of node.factionIds) {
      const faction = factions.get(factionId);
      if (!faction.memberNodeIds.includes(node.id)) faction.memberNodeIds.push(node.id);
    }
  }
  for (const faction of factions.values()) {
    faction.memberNodeIds = [...new Set(faction.memberNodeIds)].filter(id => nodes.has(id));
    for (const nodeId of faction.memberNodeIds) {
      const node = nodes.get(nodeId);
      if (!node.factionIds.includes(faction.id)) node.factionIds.push(faction.id);
    }
  }
  return graph;
}

export function updateEntity(graph, entityId, changes = {}) {
  const state = normalizeGraph(graph);
  const index = state.nodes.findIndex(node => node.id === entityId);
  if (index >= 0) {
    state.nodes[index] = normalizeActorNode({ ...state.nodes[index], ...clone(changes), id: entityId });
    synchronizeMemberships(state);
    return { state, entity: state.nodes[index] };
  }
  const factionIndex = state.factions.findIndex(faction => faction.id === entityId);
  if (factionIndex >= 0) {
    state.factions[factionIndex] = normalizeFaction({ ...state.factions[factionIndex], ...clone(changes), id: entityId });
    synchronizeMemberships(state);
    return { state, entity: state.factions[factionIndex] };
  }
  throw new TypeError("entity not found");
}

export function serializeGraph(graph, space = 2) {
  return JSON.stringify(normalizeGraph(graph), null, space);
}

export function deserializeGraph(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  const result = validateGraph(parsed);
  if (!result.valid) throw new TypeError(result.errors.join(", "));
  return result.value;
}
