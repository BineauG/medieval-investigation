import {
  BOARD_SCHEMA_VERSION,
  CARD_TAGS,
  CARD_SCHEMA_VERSION,
  DEFAULT_CONNECTION_STYLE,
  STRING_COLORS
} from "../constants.js";
import { randomId } from "../utils/ids.js";

const CARD_TYPES = new Set(["actor", "document", "free"]);
const CARD_TAG_VALUES = new Set(Object.values(CARD_TAGS));
const STRING_COLOR_VALUES = new Set(Object.values(STRING_COLORS));

function text(value, maximum = 20_000) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function connectionId(value) {
  const candidate = text(value, 100);
  return /^[A-Za-z0-9_-]+$/u.test(candidate) ? candidate : randomId();
}

export function normalizeCardTags(value) {
  const tags = Array.isArray(value) ? value : [];
  return [...new Set(tags.map(tag => String(tag || "").toLowerCase()).filter(tag => CARD_TAG_VALUES.has(tag)))];
}

export function createCardData(input = {}, { userId = "" } = {}) {
  const cardType = CARD_TYPES.has(input.cardType) ? input.cardType : "free";
  return {
    schemaVersion: CARD_SCHEMA_VERSION,
    kind: "board-card",
    cardType,
    sourceUuid: text(input.sourceUuid, 1_000) || null,
    sourceType: text(input.sourceType, 80) || null,
    titleOverride: text(input.titleOverride, 500),
    imageOverride: text(input.imageOverride, 2_000),
    // Only the dedicated vertical note card owns free text. Actor and
    // Document cards intentionally contain just their image and title.
    text: cardType === "free" ? text(input.text) : "",
    showName: input.showName !== false,
    showImage: input.showImage !== false,
    tags: normalizeCardTags(input.tags),
    createdBy: text(input.createdBy || userId, 100),
    pin: {
      anchor: "top-center",
      offsetX: finite(input.pin?.offsetX, 0),
      offsetY: finite(input.pin?.offsetY, 0)
    }
  };
}

export function normalizeStringColor(value) {
  const normalized = String(value || "").toLowerCase();
  return STRING_COLOR_VALUES.has(normalized) ? normalized : DEFAULT_CONNECTION_STYLE.color;
}

export function validateCardData(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) errors.push("card.object");
  const value = createCardData(input && typeof input === "object" ? input : {});
  if (input?.kind !== undefined && input.kind !== "board-card") errors.push("card.kind");
  if (input?.cardType !== undefined && !CARD_TYPES.has(input.cardType)) errors.push("card.cardType");
  if (value.cardType === "actor" && !value.sourceUuid) errors.push("card.actorUuid");
  return { valid: errors.length === 0, errors, value };
}

export function isBoardCard(drawing) {
  const flag = drawing?.flags?.["medieval-investigation-toolkit"];
  return flag?.kind === "board-card";
}

export function normalizeConnection(input = {}, { userId = "" } = {}) {
  return {
    id: connectionId(input.id),
    sourceCardId: text(input.sourceCardId, 100),
    targetCardId: text(input.targetCardId, 100),
    style: {
      color: normalizeStringColor(input.style?.color),
      width: Math.min(20, Math.max(1, finite(input.style?.width, DEFAULT_CONNECTION_STYLE.width))),
      sag: Math.min(0.5, Math.max(0, finite(input.style?.sag, DEFAULT_CONNECTION_STYLE.sag)))
    },
    createdBy: text(input.createdBy || userId, 100)
  };
}

export function validateConnection(input, cardIds = null) {
  const value = normalizeConnection(input);
  const errors = [];
  if (!value.sourceCardId || !value.targetCardId) errors.push("connection.endpoint");
  if (value.sourceCardId === value.targetCardId) errors.push("connection.self");
  if (cardIds && (!cardIds.has(value.sourceCardId) || !cardIds.has(value.targetCardId))) {
    errors.push("connection.missingCard");
  }
  return { valid: errors.length === 0, errors, value };
}

export function normalizeBoardState(input = {}, cardIds = null) {
  const connections = [];
  const seen = new Set();
  const seenIds = new Set();
  const indexed = input?.connectionsById && typeof input.connectionsById === "object" && !Array.isArray(input.connectionsById)
    ? Object.entries(input.connectionsById).map(([id, connection]) => ({ ...connection, id }))
    : null;
  const candidates = indexed || (Array.isArray(input.connections) ? input.connections : []);
  for (const candidate of candidates) {
    const result = validateConnection(candidate, cardIds);
    if (!result.valid) continue;
    const pair = [result.value.sourceCardId, result.value.targetCardId].sort().join("::");
    if (seen.has(pair)) continue;
    seen.add(pair);
    if (seenIds.has(result.value.id)) {
      const base = result.value.id.slice(0, 88) || randomId(12);
      let suffix = connections.length;
      while (seenIds.has(`${base}_${suffix}`)) suffix += 1;
      result.value.id = `${base}_${suffix}`;
    }
    seenIds.add(result.value.id);
    connections.push(result.value);
  }
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    enabled: Boolean(input.enabled),
    connections
  };
}

/** Convert the normalized runtime representation to the compact persistent
 * representation. Connections are keyed by id so Foundry can update one
 * string without broadcasting the entire collection. */
export function serializeBoardState(input = {}, cardIds = null) {
  const state = normalizeBoardState(input, cardIds);
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    enabled: state.enabled,
    connectionsById: Object.fromEntries(state.connections.map(connection => [connection.id, connection]))
  };
}

export function hasIndexedConnectionStorage(input = {}) {
  return Number(input?.schemaVersion || 0) === BOARD_SCHEMA_VERSION
    && Boolean(input?.connectionsById)
    && typeof input.connectionsById === "object"
    && !Array.isArray(input.connectionsById)
    && !Object.hasOwn(input, "connections");
}

export function addConnection(board, connection, cardIds = null) {
  const state = normalizeBoardState(board, cardIds);
  const result = validateConnection(connection, cardIds);
  if (!result.valid) return { changed: false, state, errors: result.errors };
  const duplicate = state.connections.some(existing => {
    const direct = existing.sourceCardId === result.value.sourceCardId && existing.targetCardId === result.value.targetCardId;
    const reverse = existing.sourceCardId === result.value.targetCardId && existing.targetCardId === result.value.sourceCardId;
    return direct || reverse;
  });
  if (duplicate) return { changed: false, state, errors: ["connection.duplicate"] };
  state.connections.push(result.value);
  return { changed: true, state, connection: result.value, errors: [] };
}

export function removeConnection(board, connectionId) {
  const state = normalizeBoardState(board);
  const before = state.connections.length;
  state.connections = state.connections.filter(connection => connection.id !== connectionId);
  return { changed: before !== state.connections.length, state };
}

export function removeCardConnections(board, cardId) {
  const state = normalizeBoardState(board);
  const before = state.connections.length;
  state.connections = state.connections.filter(connection => (
    connection.sourceCardId !== cardId && connection.targetCardId !== cardId
  ));
  return { changed: before !== state.connections.length, state };
}
