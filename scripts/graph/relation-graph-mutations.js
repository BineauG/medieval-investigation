import {
  addActorNode,
  addCustomNode,
  addEdge,
  addFaction,
  addRelationLabel,
  normalizeGraph,
  removeEdge,
  removeEntity,
  removeRelationLabel,
  setMembership,
  updateEntity,
  validateGraph
} from "./relation-graph-data.js";
import { conflictingFields } from "../utils/concurrency.js";
import { canModifyGraph } from "../utils/permissions.js";

const clone = value => structuredClone(value);
const NODE_MOVE_FIELDS = new Set(["x", "y"]);
const ENTITY_FIELDS = new Set([
  "x", "y", "width", "height", "nameOverride", "imageOverride", "cachedName", "cachedImage",
  "hideName", "hideAppearance", "dead", "factionIds", "name", "description", "shape", "points",
  "style", "z", "memberNodeIds"
]);
const EDGE_FIELDS = new Set(["label", "mutual", "labelPosition", "style"]);

function entity(state, id) {
  return state.nodes.find(item => item.id === id) || state.factions.find(item => item.id === id) || null;
}

function changedKeys(changes, allowed) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new TypeError("Invalid graph changes");
  const keys = Object.keys(changes);
  if (!keys.length || keys.some(key => !allowed.has(key))) throw new TypeError("Invalid graph changes");
  return keys;
}

function assertExpected(current, expected, keys) {
  if (conflictingFields(current, expected || {}, keys).length) throw new Error("Errors.GraphConflict");
}

function actionForEntityChange(target, changes) {
  if (!target) throw new Error("Errors.GraphMissing");
  const keys = Object.keys(changes || {});
  if (target.kind === "actor" && keys.length && keys.every(key => NODE_MOVE_FIELDS.has(key))) return "moveNode";
  return target.kind === "actor" ? "updateNode" : "updateFaction";
}

export function assertGraphMutationPermission(user, graphInput, mutation) {
  const graph = normalizeGraph(graphInput);
  let action;
  switch (mutation?.kind) {
    case "addActorNode": action = "createNode"; break;
    case "addCustomNode": action = "createNode"; break;
    case "addFaction": action = "createFaction"; break;
    case "restoreEntity": action = mutation.entity?.kind === "actor" ? "createNode" : "createFaction"; break;
    case "addEdge": action = "createEdge"; break;
    case "updateEdge": action = "updateEdge"; break;
    case "removeEdge": action = "deleteEdge"; break;
    case "removeRelationLabel": action = "updateEdge"; break;
    case "restoreRelationLabel": action = "updateEdge"; break;
    case "replaceGraph": action = "replaceGraph"; break;
    case "removeEntity": {
      const target = entity(graph, mutation.entityId);
      action = target?.kind === "actor" ? "deleteNode" : "deleteFaction";
      break;
    }
    case "updateEntity": {
      action = actionForEntityChange(entity(graph, mutation.entityId), mutation.changes);
      break;
    }
    case "moveEntities": {
      const entries = Array.isArray(mutation.entries) ? mutation.entries : [];
      if (!entries.length) throw new TypeError("Invalid graph movement");
      for (const entry of entries) {
        const target = entity(graph, entry.entityId);
        const entryAction = actionForEntityChange(target, entry.changes);
        if (!canModifyGraph(user, entryAction)) throw new Error("Errors.PermissionDenied");
      }
      return true;
    }
    default: throw new TypeError("Unsupported graph mutation");
  }
  if (!canModifyGraph(user, action)) throw new Error("Errors.PermissionDenied");
  return true;
}

function addAutomaticMemberships(state, movedNodeIds) {
  let next = state;
  for (const nodeId of movedNodeIds) {
    const node = next.nodes.find(item => item.id === nodeId);
    if (!node) continue;
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    for (const faction of next.factions) {
      const inside = centerX >= faction.x && centerX <= faction.x + faction.width
        && centerY >= faction.y && centerY <= faction.y + faction.height;
      if (inside && !node.factionIds.includes(faction.id)) next = setMembership(next, node.id, faction.id, true).state;
    }
  }
  return next;
}

export function applyGraphMutation(graphInput, mutation) {
  let state = normalizeGraph(graphInput);
  let result = {};

  switch (mutation?.kind) {
    case "addActorNode": {
      const applied = addActorNode(state, mutation.node);
      state = applied.state;
      result = { entityId: applied.node.id, changed: applied.changed };
      break;
    }
    case "addCustomNode": {
      const applied = addCustomNode(state, mutation.node);
      state = applied.state;
      result = { entityId: applied.node.id, changed: applied.changed };
      break;
    }
    case "addFaction": {
      const applied = addFaction(state, mutation.faction);
      state = applied.state;
      result = { entityId: applied.faction.id, changed: true };
      break;
    }
    case "addEdge": {
      if (mutation.newRelationLabel) state = addRelationLabel(state, mutation.newRelationLabel).state;
      const applied = addEdge(state, mutation.edge);
      state = applied.state;
      result = { edgeId: applied.edge.id, changed: true };
      break;
    }
    case "updateEdge": {
      const edge = state.edges.find(item => item.id === mutation.edgeId);
      if (!edge) throw new Error("Errors.GraphMissing");
      if (mutation.newRelationLabel) state = addRelationLabel(state, mutation.newRelationLabel).state;
      const currentEdge = state.edges.find(item => item.id === mutation.edgeId);
      const keys = changedKeys(mutation.changes, EDGE_FIELDS);
      assertExpected(currentEdge, mutation.expected, keys);
      Object.assign(currentEdge, clone(mutation.changes));
      state = normalizeGraph(state);
      result = { edgeId: mutation.edgeId, changed: true };
      break;
    }
    case "removeEdge": {
      const applied = removeEdge(state, mutation.edgeId);
      state = applied.state;
      result = { edgeId: mutation.edgeId, changed: applied.changed };
      break;
    }
    case "updateEntity": {
      const current = entity(state, mutation.entityId);
      if (!current) throw new Error("Errors.GraphMissing");
      const keys = changedKeys(mutation.changes, ENTITY_FIELDS);
      assertExpected(current, mutation.expected, keys);
      const applied = updateEntity(state, mutation.entityId, mutation.changes);
      state = applied.state;
      result = { entityId: mutation.entityId, changed: true };
      break;
    }
    case "moveEntities": {
      const entries = Array.isArray(mutation.entries) ? mutation.entries.slice(0, 500) : [];
      if (!entries.length) throw new TypeError("Invalid graph movement");
      const movedNodeIds = [];
      for (const entry of entries) {
        const current = entity(state, entry.entityId);
        if (!current) throw new Error("Errors.GraphMissing");
        const allowed = current.kind === "actor" ? NODE_MOVE_FIELDS : new Set(["x", "y", "width", "height"]);
        const keys = changedKeys(entry.changes, allowed);
        assertExpected(current, entry.expected, keys);
        state = updateEntity(state, entry.entityId, entry.changes).state;
        if (current.kind === "actor") movedNodeIds.push(entry.entityId);
      }
      if (mutation.addMemberships) state = addAutomaticMemberships(state, movedNodeIds);
      result = { entityIds: entries.map(entry => entry.entityId), changed: true };
      break;
    }
    case "removeEntity": {
      const applied = removeEntity(state, mutation.entityId);
      state = applied.state;
      result = { entityId: mutation.entityId, changed: applied.changed };
      break;
    }
    case "restoreEntity": {
      const restored = mutation.entity;
      if (!restored || typeof restored !== "object") throw new TypeError("Invalid graph entity");
      if (restored.kind === "faction") state = addFaction(state, restored).state;
      else if (restored.actorUuid) state = addActorNode(state, restored).state;
      else state = addCustomNode(state, restored).state;
      for (const edge of Array.isArray(mutation.edges) ? mutation.edges.slice(0, 500) : []) {
        if (!state.edges.some(item => item.id === edge.id)) state = addEdge(state, edge).state;
      }
      result = { entityId: restored.id, changed: true };
      break;
    }
    case "removeRelationLabel": {
      const applied = removeRelationLabel(state, mutation.definition);
      state = applied.state;
      result = { changed: applied.changed, removedEdges: applied.removedEdges };
      break;
    }
    case "restoreRelationLabel": {
      const definition = mutation.definition || {};
      if (definition.key) {
        state.disabledRelationPresetKeys = state.disabledRelationPresetKeys.filter(key => key !== definition.key);
      } else if (definition.label) {
        state = addRelationLabel(state, definition).state;
      }
      for (const edge of Array.isArray(mutation.edges) ? mutation.edges.slice(0, 500) : []) {
        if (!state.edges.some(item => item.id === edge.id)) state = addEdge(state, edge).state;
      }
      result = { changed: true };
      break;
    }
    case "replaceGraph": {
      const validated = validateGraph(mutation.graph);
      if (!validated.valid) throw new Error("Errors.InvalidGraph");
      state = validated.value;
      result = { changed: true };
      break;
    }
    default: throw new TypeError("Unsupported graph mutation");
  }

  return { graph: normalizeGraph(state), result };
}
