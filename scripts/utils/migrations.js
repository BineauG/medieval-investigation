import { BOARD_SCHEMA_VERSION, CARD_SCHEMA_VERSION, GRAPH_SCHEMA_VERSION } from "../constants.js";
import { createCardData, normalizeBoardState } from "../board/board-data.js";
import { normalizeGraph } from "../graph/relation-graph-data.js";

export function migrateCard(input = {}) {
  const version = Number(input.schemaVersion || 0);
  if (version > CARD_SCHEMA_VERSION) throw new TypeError("Unsupported card schema version");
  const migrated = { ...input };
  if (version === 0) {
    migrated.cardType ??= migrated.type === "actor" ? "actor" : migrated.sourceUuid ? "document" : "free";
    migrated.text ??= migrated.note ?? "";
  }
  return createCardData(migrated);
}

export function migrateBoard(input = {}, cardIds = null) {
  const version = Number(input.schemaVersion || 0);
  if (version > BOARD_SCHEMA_VERSION) throw new TypeError("Unsupported board schema version");
  return normalizeBoardState(input, cardIds);
}

export function migrateGraph(input = {}) {
  const version = Number(input.schemaVersion || 0);
  if (version > GRAPH_SCHEMA_VERSION) throw new TypeError("Unsupported graph schema version");
  const migrated = { ...input };
  if (version === 0) {
    migrated.factions ??= (Array.isArray(migrated.nodes) ? migrated.nodes : []).filter(node => node.kind === "faction");
    migrated.nodes = (Array.isArray(migrated.nodes) ? migrated.nodes : []).filter(node => node.kind !== "faction");
    migrated.viewport ??= { x: 0, y: 0, zoom: 1 };
  }
  if (version < 2) {
    migrated.nodes = (Array.isArray(migrated.nodes) ? migrated.nodes : []).map(node => ({
      ...node,
      height: Number(node?.width || node?.height || 112)
    }));
    migrated.edges = (Array.isArray(migrated.edges) ? migrated.edges : []).map(edge => ({
      ...edge,
      directed: true
    }));
  }
  if (version < 3) {
    migrated.nodes = (Array.isArray(migrated.nodes) ? migrated.nodes : []).map(node => ({
      ...node,
      hideName: Boolean(node?.hideName),
      hideAppearance: Boolean(node?.hideAppearance)
    }));
    migrated.edges = (Array.isArray(migrated.edges) ? migrated.edges : []).map(edge => ({
      ...edge,
      mutual: Boolean(edge?.mutual)
    }));
  }
  if (version < 4) {
    migrated.relationLabels = [];
    migrated.disabledRelationPresetKeys = [];
  }
  return normalizeGraph(migrated);
}
