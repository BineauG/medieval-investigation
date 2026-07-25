import { DEFAULT_CARD_SIZE, DEFAULT_NOTE_SIZE, MODULE_ID } from "../constants.js";
import { drawingData, drawingDimensions, drawingElevation } from "../compatibility/foundry-version.js";
import {
  addConnection,
  createCardData,
  hasIndexedConnectionStorage,
  normalizeConnection,
  removeConnection,
  serializeBoardState,
  validateCardData
} from "./board-data.js";
import { canModifyBoard, settingsSnapshot } from "../utils/permissions.js";
import { canViewDocument, isAudioReference, isVideoReference, resolveUuid } from "../utils/documents.js";
import { migrateBoard, migrateCard } from "../utils/migrations.js";
import { getSetting } from "../settings.js";
import { socketService } from "./board-sockets.js";
import { logger } from "../utils/log.js";
import { sizeForImageAspectRatio } from "./card-sizing.js";
import { normalizeNoteText } from "./note-data.js";
import { conflictingFields } from "../utils/concurrency.js";

const BOARD_FLAG = "investigationBoard";
const BOARD_PATH = `flags.${MODULE_ID}.${BOARD_FLAG}`;

function rawBoardState(scene) {
  return scene?.flags?.[MODULE_ID]?.[BOARD_FLAG]
    || scene?.getFlag?.(MODULE_ID, BOARD_FLAG)
    || {};
}

function indexedStorageUpdate(stored, previous = {}) {
  const update = {
    [`${BOARD_PATH}.schemaVersion`]: stored.schemaVersion,
    [`${BOARD_PATH}.enabled`]: stored.enabled,
    [`${BOARD_PATH}.connectionsById`]: stored.connectionsById,
    [`${BOARD_PATH}.-=connections`]: null
  };
  const oldIds = previous?.connectionsById && typeof previous.connectionsById === "object"
    ? Object.keys(previous.connectionsById)
    : [];
  for (const id of oldIds) {
    if (!Object.hasOwn(stored.connectionsById, id)) update[`${BOARD_PATH}.connectionsById.-=${id}`] = null;
  }
  return update;
}

function boardSettings() {
  return settingsSnapshot(name => getSetting(name));
}

function sceneById(sceneId) {
  return game.scenes?.get(sceneId) || null;
}

function cardFlag(drawing) {
  return drawing?.flags?.[MODULE_ID];
}

function sanitizeNoteCard(card) {
  if (card.cardType !== "free") return card;
  card.titleOverride = normalizeNoteText(card.titleOverride || card.text);
  card.text = "";
  card.imageOverride = "";
  card.sourceUuid = null;
  card.sourceType = null;
  card.showName = true;
  card.showImage = false;
  return card;
}

export class BoardController {
  connectionSourceId = null;
  connectionModeActive = false;
  #stateCache = new WeakMap();

  get scene() {
    return canvas?.scene || null;
  }

  getState(scene = this.scene) {
    if (!scene || typeof scene !== "object") return migrateBoard({});
    const raw = rawBoardState(scene);
    const cached = this.#stateCache.get(scene);
    if (cached?.raw === raw) return cached.state;
    const state = migrateBoard(raw);
    this.#stateCache.set(scene, { raw, state });
    return state;
  }

  invalidateState(scene = this.scene) {
    if (scene && typeof scene === "object") this.#stateCache.delete(scene);
  }

  hasState(scene = this.scene) {
    return Boolean(scene?.flags?.[MODULE_ID]?.[BOARD_FLAG]);
  }

  isEnabled(scene = this.scene) {
    return Boolean(rawBoardState(scene).enabled);
  }

  async setEnabled(scene, enabled) {
    if (!game.user.isGM) throw new Error("Errors.GMOnly");
    await this.#ensureIndexedStorage(scene);
    await scene.update({
      [`${BOARD_PATH}.enabled`]: Boolean(enabled)
    }, { mitBoardChange: "enabled" });
    this.invalidateState(scene);
    return Boolean(enabled);
  }

  async toggle(scene = this.scene) {
    return this.setEnabled(scene, !this.isEnabled(scene));
  }

  cards(scene = this.scene) {
    return [...(scene?.drawings || [])].filter(drawing => cardFlag(drawing)?.kind === "board-card");
  }

  cardIds(scene = this.scene) {
    return new Set(this.cards(scene).map(drawing => drawing.id));
  }

  async createCard(cardInput, position = {}, scene = this.scene) {
    return socketService.request("board.createCard", { sceneId: scene?.id, card: cardInput, position });
  }

  async updateCard(drawingId, changes, scene = this.scene, { expected = null } = {}) {
    return socketService.request("board.updateCard", { sceneId: scene?.id, drawingId, changes, expected });
  }

  async moveCard(drawingId, changes, scene = this.scene) {
    return socketService.request("board.moveCard", { sceneId: scene?.id, drawingId, changes });
  }

  async duplicateCard(drawingId, scene = this.scene) {
    return socketService.request("board.duplicateCard", { sceneId: scene?.id, drawingId });
  }

  async deleteCard(drawingId, scene = this.scene) {
    return socketService.request("board.deleteCard", { sceneId: scene?.id, drawingId });
  }

  async createConnection(sourceCardId, targetCardId, style = {}, scene = this.scene) {
    return socketService.request("board.createConnection", { sceneId: scene?.id, sourceCardId, targetCardId, style });
  }

  async updateConnection(connectionId, style, scene = this.scene, { expectedStyle = null } = {}) {
    return socketService.request("board.updateConnection", { sceneId: scene?.id, connectionId, style, expectedStyle });
  }

  async deleteConnection(connectionId, scene = this.scene) {
    return socketService.request("board.deleteConnection", { sceneId: scene?.id, connectionId });
  }

  startConnection(cardId = null, { announce = false } = {}) {
    this.connectionModeActive = true;
    this.connectionSourceId = cardId;
    Hooks.callAll(`${MODULE_ID}.connectionMode`, cardId);
    if (announce) ui.notifications.info(game.i18n.localize(`${MODULE_ID}.Board.ConnectionHelp`));
  }

  cancelConnection() {
    this.connectionModeActive = false;
    this.connectionSourceId = null;
    Hooks.callAll(`${MODULE_ID}.connectionMode`, null);
  }

  async sealClicked(cardId) {
    // A normal pin click is inert. The two-click workflow only starts after
    // the Connections toolbar button explicitly enables connection mode;
    // Shift-drag uses startConnection directly from the pin layer.
    if (!this.connectionModeActive) return false;
    if (!this.connectionSourceId) {
      this.startConnection(cardId);
      return true;
    }
    const source = this.connectionSourceId;
    this.cancelConnection();
    if (source === cardId) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.Errors.SelfConnection`));
      return false;
    }
    try {
      await this.createConnection(source, cardId);
      return true;
    } catch (error) {
      this.notifyError(error);
      return false;
    }
  }

  notifyError(error) {
    const message = String(error?.message || error || "Errors.RequestRejected");
    const key = message.startsWith(`${MODULE_ID}.`) ? message : `${MODULE_ID}.${message}`;
    ui.notifications.error(game.i18n.has?.(key) ? game.i18n.localize(key) : message);
  }

  async handleOperation(operation, payload, user) {
    if (!operation.startsWith("board.")) return undefined;
    const scene = sceneById(payload?.sceneId);
    if (!scene || !this.isEnabled(scene)) throw new Error("Errors.BoardUnavailable");
    const action = operation.slice("board.".length);
    const drawing = payload?.drawingId ? scene.drawings?.get(payload.drawingId) : null;
    const card = drawing ? cardFlag(drawing) : null;
    if (!canModifyBoard(user, action, card, boardSettings())) throw new Error("Errors.PermissionDenied");

    switch (action) {
      case "createCard": return this.#createCard(scene, payload, user);
      case "updateCard": return this.#updateCard(scene, drawing, payload.changes, payload.expected, user);
      case "moveCard": return this.#moveCard(scene, drawing, payload.changes);
      case "duplicateCard": return this.#duplicateCard(scene, drawing, user);
      case "deleteCard": return this.#deleteCard(scene, drawing);
      case "createConnection": return this.#createConnection(scene, payload, user);
      case "updateConnection": return this.#updateConnection(scene, payload, user);
      case "deleteConnection": return this.#deleteConnection(scene, payload.connectionId);
      default: throw new Error("Errors.RequestRejected");
    }
  }

  async #createCard(scene, payload, user) {
    const result = validateCardData({ ...payload.card, createdBy: user.id });
    if (!result.valid) throw new Error("Errors.InvalidCard");
    const card = sanitizeNoteCard(result.value);
    if (card.sourceUuid) {
      const source = await resolveUuid(card.sourceUuid);
      if (!source) throw new Error("Errors.InvalidUuid");
      if (isAudioReference(source)) throw new Error("Errors.AudioUnsupported");
      if (isVideoReference(source)) throw new Error("Errors.VideoUnsupported");
      if (!canViewDocument(source, user)) throw new Error("Errors.PermissionDenied");
      if (card.cardType === "actor" && source.documentName !== "Actor") throw new Error("Errors.ActorRequired");
      card.sourceType = source.documentName;
    }
    if (isAudioReference(payload.card) || isVideoReference(payload.card)) {
      throw new Error(isAudioReference(payload.card) ? "Errors.AudioUnsupported" : "Errors.VideoUnsupported");
    }
    const scale = Number(getSetting("cardScale") || 1);
    const minimum = Number(getSetting("minimumCardSize") || 120);
    const defaultSize = card.cardType === "free" ? DEFAULT_NOTE_SIZE : DEFAULT_CARD_SIZE;
    let width = Math.max(minimum, Number(payload.position?.width || defaultSize.width) * scale);
    let height = Math.max(minimum, Number(payload.position?.height || defaultSize.height) * scale);
    if (card.cardType === "free" && !Number.isFinite(Number(payload.position?.height))) {
      height = Math.max(height, width * 2.4);
    }
    if (card.cardType === "document" && card.imageOverride && !Number.isFinite(Number(payload.position?.height))) {
      const adapted = sizeForImageAspectRatio(payload.position?.imageAspectRatio, { width, minimum });
      if (adapted) ({ width, height } = adapted);
    }
    const x = Number.isFinite(Number(payload.position?.x)) ? Number(payload.position.x) - width / 2 : scene.width / 2 - width / 2;
    const y = Number.isFinite(Number(payload.position?.y)) ? Number(payload.position.y) - height / 2 : scene.height / 2 - height / 2;
    const z = Math.max(0, ...this.cards(scene).map(drawingElevation)) + 1;
    const created = await scene.createEmbeddedDocuments("Drawing", [drawingData({ x, y, width, height, z, flags: card })]);
    return { drawingId: created[0]?.id };
  }

  async #updateCard(scene, drawing, changes = {}, expected = null, user) {
    if (!drawing || cardFlag(drawing)?.kind !== "board-card") throw new Error("Errors.CardMissing");
    const current = migrateCard(cardFlag(drawing));
    const allowed = user.isGM
      ? ["titleOverride", "imageOverride", "text", "showName", "showImage", "sourceUuid", "sourceType", "pin", "tags"]
      : ["titleOverride", "tags"];
    const patch = Object.fromEntries(allowed.filter(key => Object.hasOwn(changes, key)).map(key => [key, changes[key]]));
    const changedKeys = Object.keys(patch);
    if (!user.isGM && changedKeys.length) {
      const expectedInput = expected && typeof expected === "object" ? expected : {};
      if (changedKeys.some(key => !Object.hasOwn(expectedInput, key))) throw new Error("Errors.EditConflict");
      const normalizedExpected = createCardData({ ...current, ...expectedInput, createdBy: current.createdBy });
      if (conflictingFields(current, normalizedExpected, changedKeys).length) throw new Error("Errors.EditConflict");
    }
    const next = sanitizeNoteCard(createCardData({ ...current, ...patch, createdBy: current.createdBy }));
    if (next.sourceUuid && next.sourceUuid !== current.sourceUuid) {
      const source = await resolveUuid(next.sourceUuid);
      if (!source) throw new Error("Errors.InvalidUuid");
      if (isAudioReference(source)) throw new Error("Errors.AudioUnsupported");
      if (isVideoReference(source)) throw new Error("Errors.VideoUnsupported");
      if (!canViewDocument(source, user)) throw new Error("Errors.PermissionDenied");
      if (next.cardType === "actor" && source.documentName !== "Actor") throw new Error("Errors.ActorRequired");
      next.sourceType = source.documentName;
    }
    const drawingPatch = { _id: drawing.id, [`flags.${MODULE_ID}`]: next };
    const imageChanged = Object.hasOwn(changes, "imageOverride")
      && next.cardType === "document"
      && Boolean(next.imageOverride)
      && (next.imageOverride !== current.imageOverride || Boolean(changes.imageAspectRatio));
    if (imageChanged) {
      const currentSize = drawingDimensions(drawing);
      const adapted = sizeForImageAspectRatio(changes.imageAspectRatio, {
        width: currentSize.width,
        minimum: Number(getSetting("minimumCardSize") || 120)
      });
      if (adapted) {
        drawingPatch.x = Number(drawing.x || 0) + (currentSize.width - adapted.width) / 2;
        drawingPatch.y = Number(drawing.y || 0) + (currentSize.height - adapted.height) / 2;
        drawingPatch["shape.width"] = adapted.width;
        drawingPatch["shape.height"] = adapted.height;
      }
    }
    if (!changedKeys.length && !Object.hasOwn(changes, "imageAspectRatio")) return { drawingId: drawing.id };
    await scene.updateEmbeddedDocuments("Drawing", [drawingPatch]);
    return { drawingId: drawing.id };
  }

  async #moveCard(scene, drawing, changes = {}) {
    if (!drawing || cardFlag(drawing)?.kind !== "board-card") throw new Error("Errors.CardMissing");
    const minimum = Number(getSetting("minimumCardSize") || 120);
    const current = drawingDimensions(drawing);
    const patch = { _id: drawing.id };
    if (Number.isFinite(Number(changes.x))) patch.x = Number(changes.x);
    if (Number.isFinite(Number(changes.y))) patch.y = Number(changes.y);
    if (Number.isFinite(Number(changes.z))) patch.elevation = Number(changes.z);
    if (Number.isFinite(Number(changes.width))) patch["shape.width"] = Math.max(minimum, Number(changes.width));
    if (Number.isFinite(Number(changes.height))) patch["shape.height"] = Math.max(minimum, Number(changes.height));
    if (!Object.hasOwn(patch, "shape.width")) patch["shape.width"] = current.width;
    if (!Object.hasOwn(patch, "shape.height")) patch["shape.height"] = current.height;
    await scene.updateEmbeddedDocuments("Drawing", [patch]);
    return { drawingId: drawing.id };
  }

  async #duplicateCard(scene, drawing, user) {
    if (!drawing || cardFlag(drawing)?.kind !== "board-card") throw new Error("Errors.CardMissing");
    const source = drawing.toObject();
    delete source._id;
    source.x += 40;
    source.y += 40;
    source.elevation = drawingElevation(drawing) + 1;
    source.flags[MODULE_ID] = sanitizeNoteCard(createCardData({ ...migrateCard(cardFlag(drawing)), createdBy: user.id }));
    const created = await scene.createEmbeddedDocuments("Drawing", [source]);
    return { drawingId: created[0]?.id };
  }

  async #deleteCard(scene, drawing) {
    if (!drawing || cardFlag(drawing)?.kind !== "board-card") throw new Error("Errors.CardMissing");
    const removedIds = this.getState(scene).connections
      .filter(connection => connection.sourceCardId === drawing.id || connection.targetCardId === drawing.id)
      .map(connection => connection.id);
    await this.#ensureIndexedStorage(scene);
    if (removedIds.length) {
      const update = Object.fromEntries(removedIds.map(id => [`${BOARD_PATH}.connectionsById.-=${id}`, null]));
      await scene.update(update, { mitBoardChange: "connections", mitConnectionIds: removedIds });
      this.invalidateState(scene);
    }
    await scene.deleteEmbeddedDocuments("Drawing", [drawing.id], { mitConfirmed: true });
    return { drawingId: drawing.id, removedConnections: removedIds.length };
  }

  async #createConnection(scene, payload, user) {
    const connection = normalizeConnection({
      sourceCardId: payload.sourceCardId,
      targetCardId: payload.targetCardId,
      style: {
        color: payload.style?.color || getSetting("stringColor"),
        width: payload.style?.width || getSetting("stringWidth"),
        sag: payload.style?.sag
      },
      createdBy: user.id
    });
    const result = addConnection(this.getState(scene), connection, this.cardIds(scene));
    if (!result.changed) throw new Error(result.errors.includes("connection.duplicate") ? "Errors.DuplicateConnection" : "Errors.InvalidConnection");
    await this.#ensureIndexedStorage(scene);
    await this.#writeConnection(scene, result.connection);
    return result.connection;
  }

  async #updateConnection(scene, payload, user) {
    const state = this.getState(scene);
    const existing = state.connections.find(connection => connection.id === payload.connectionId);
    if (!existing) throw new Error("Errors.ConnectionMissing");
    const allowed = ["color", "width", "sag"];
    const styleInput = payload.style && typeof payload.style === "object" ? payload.style : {};
    const changedKeys = allowed.filter(key => Object.hasOwn(styleInput, key));
    if (!changedKeys.length) return existing;
    const normalizedNext = normalizeConnection({ ...existing, style: { ...existing.style, ...styleInput } }).style;
    if (!user.isGM) {
      const expectedInput = payload.expectedStyle && typeof payload.expectedStyle === "object" ? payload.expectedStyle : {};
      if (changedKeys.some(key => !Object.hasOwn(expectedInput, key))) throw new Error("Errors.EditConflict");
      const normalizedExpected = normalizeConnection({ ...existing, style: { ...existing.style, ...expectedInput } }).style;
      if (conflictingFields(existing.style, normalizedExpected, changedKeys).length) throw new Error("Errors.EditConflict");
    }
    const next = normalizeConnection({
      ...existing,
      style: { ...existing.style, ...Object.fromEntries(changedKeys.map(key => [key, normalizedNext[key]])) }
    });
    await this.#ensureIndexedStorage(scene);
    await this.#writeConnection(scene, next);
    return next;
  }

  async #deleteConnection(scene, connectionId) {
    const result = removeConnection(this.getState(scene), connectionId);
    if (!result.changed) throw new Error("Errors.ConnectionMissing");
    await this.#ensureIndexedStorage(scene);
    await scene.update({
      [`${BOARD_PATH}.connectionsById.-=${connectionId}`]: null
    }, { mitBoardChange: "connections", mitConnectionIds: [connectionId] });
    this.invalidateState(scene);
    return { connectionId };
  }

  async #writeConnection(scene, connection) {
    await scene.update({
      [`${BOARD_PATH}.connectionsById.${connection.id}`]: connection
    }, { mitBoardChange: "connections", mitConnectionIds: [connection.id] });
    this.invalidateState(scene);
  }

  async #ensureIndexedStorage(scene) {
    const raw = rawBoardState(scene);
    if (hasIndexedConnectionStorage(raw)) return false;
    const stored = serializeBoardState(this.getState(scene), this.cardIds(scene));
    await scene.update(indexedStorageUpdate(stored, raw), { mitBoardChange: "migration" });
    this.invalidateState(scene);
    return true;
  }

  async migrateScene(scene = this.scene) {
    if (!scene || !game.user.isGM) return;
    const ids = this.cardIds(scene);
    const raw = rawBoardState(scene);
    if (!hasIndexedConnectionStorage(raw)) {
      const stored = serializeBoardState(migrateBoard(raw, ids), ids);
      await scene.update(indexedStorageUpdate(stored, raw), { mitBoardChange: "migration" });
      this.invalidateState(scene);
    }
    const updates = this.cards(scene).flatMap(drawing => {
      const current = cardFlag(drawing);
      const migrated = migrateCard(current);
      return JSON.stringify(current) === JSON.stringify(migrated)
        ? []
        : [{ _id: drawing.id, [`flags.${MODULE_ID}`]: migrated }];
    });
    if (updates.length) await scene.updateEmbeddedDocuments("Drawing", updates);
    logger.debug("Board migration complete", scene.id, updates.length);
  }
}

export const boardController = new BoardController();
