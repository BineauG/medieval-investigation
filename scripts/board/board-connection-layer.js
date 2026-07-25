import { BOARD_PIN_SCALE, MODULE_ID } from "../constants.js";
import { strokePath } from "../compatibility/pixi-graphics.js";
import { boardController } from "./board-controller.js";
import { BoardConnectionSheet } from "./board-connection-sheet.js";
import { getSetting } from "../settings.js";
import {
  loadOptimizedTexture,
  MAX_DECORATION_TEXTURE_DIMENSION,
  MAX_DECORATION_TEXTURE_PIXELS
} from "./image-texture-cache.js";

/**
 * Draws red strings and globally interactive seals. Cards themselves are
 * rendered by BoardDrawing, following Investigation Board's proven
 * "one Drawing = one card, detached pins above Drawings" model.
 */
class BoardConnectionLayer {
  #graphics = new Map();
  #pins = new Map();
  #connections = new Map();
  #adjacency = new Map();
  #container = null;
  #pinContainer = null;
  #preview = null;
  #previewHandler = null;
  #selectedId = null;
  #raf = null;
  #menu = null;
  #dragSourceId = null;
  #stagePointerUpHandler = null;
  #suppressTapUntil = 0;
  #activePinId = null;
  #lastLineTap = { id: null, time: 0 };
  #dragPositions = new Map();
  #stageSelectionHandler = null;
  #stageSelectionUsesCapture = false;
  #fullRefreshPending = false;
  #dirtyCardIds = new Set();
  #dirtyConnectionIds = new Set();

  get selectedId() {
    return this.#selectedId;
  }

  get isDraggingPin() {
    return Boolean(this.#dragSourceId);
  }

  initialize() {
    this.destroy();
    if (!canvas?.ready || !boardController.isEnabled()) return;
    this.#ensureContainer();
    this.#ensurePinContainer();
    this.#installStageSelectionHandler();
    this.refresh();
  }

  #ensureContainer() {
    if (this.#container && !this.#container.destroyed) return this.#container;
    if (!canvas?.drawings || !globalThis.PIXI?.Container) return null;
    const container = new PIXI.Container();
    container.label = `${MODULE_ID}-strings`;
    // Investigation Board renders yarn above note Drawings (z 0–2) and
    // below the detached pins. A negative z-index can fall behind the layer.
    container.zIndex = 10;
    container.eventMode = "passive";
    container.interactiveChildren = true;
    canvas.drawings.sortableChildren = true;
    canvas.drawings.addChild(container);
    this.#container = container;
    return container;
  }

  #ensurePinContainer() {
    if (this.#pinContainer && !this.#pinContainer.destroyed) return this.#pinContainer;
    if (!canvas?.drawings || !globalThis.PIXI?.Container) return null;
    const container = new PIXI.Container();
    container.label = `${MODULE_ID}-pins`;
    container.zIndex = 20;
    container.eventMode = "passive";
    container.interactiveChildren = true;
    canvas.drawings.sortableChildren = true;
    canvas.drawings.addChild(container);
    this.#pinContainer = container;
    return container;
  }

  scheduleRefresh() {
    this.#fullRefreshPending = true;
    this.#queueRefresh();
  }

  scheduleCardRefresh(cardIds = []) {
    const ids = typeof cardIds === "string" ? [cardIds] : cardIds;
    for (const id of ids || []) if (id) this.#dirtyCardIds.add(id);
    this.#queueRefresh();
  }

  scheduleConnectionRefresh(connectionIds = []) {
    const ids = typeof connectionIds === "string" ? [connectionIds] : connectionIds;
    for (const id of ids || []) if (id) this.#dirtyConnectionIds.add(id);
    if (!this.#dirtyConnectionIds.size) this.#fullRefreshPending = true;
    this.#queueRefresh();
  }

  #queueRefresh() {
    if (this.#raf !== null) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = null;
      if (this.#fullRefreshPending) this.refresh();
      else this.#refreshDirty();
    });
  }

  refresh() {
    if (!canvas?.ready || !boardController.isEnabled()) {
      this.#clearGraphics();
      this.#clearPins();
      this.#connections.clear();
      this.#adjacency.clear();
      this.#fullRefreshPending = false;
      this.#dirtyCardIds.clear();
      this.#dirtyConnectionIds.clear();
      return;
    }
    const container = this.#ensureContainer();
    const pinContainer = this.#ensurePinContainer();
    if (!container || !pinContainer) return;
    const cards = boardController.cards();
    this.#refreshPins(cards);
    const connections = boardController.getState().connections;
    this.#replaceConnectionIndex(connections);
    const activeIds = new Set(this.#connections.keys());
    for (const id of this.#graphics.keys()) {
      if (!activeIds.has(id)) this.#removeGraphic(id);
    }
    for (const connection of this.#connections.values()) this.#drawConnection(connection);
    this.#fullRefreshPending = false;
    this.#dirtyCardIds.clear();
    this.#dirtyConnectionIds.clear();
  }

  #refreshDirty() {
    if (!canvas?.ready || !boardController.isEnabled()) {
      this.refresh();
      return;
    }
    const dirtyConnections = new Set(this.#dirtyConnectionIds);
    const dirtyCards = new Set(this.#dirtyCardIds);
    this.#dirtyConnectionIds.clear();
    this.#dirtyCardIds.clear();

    if (dirtyConnections.size) {
      const current = new Map(boardController.getState().connections.map(connection => [connection.id, connection]));
      for (const id of dirtyConnections) this.#replaceIndexedConnection(id, current.get(id) || null);
    }

    for (const id of dirtyCards) {
      const drawing = canvas?.drawings?.get?.(id);
      if (drawing?.document?.flags?.[MODULE_ID]?.kind === "board-card") this.#drawPin(drawing);
      else this.#removePin(id);
      for (const connectionId of this.#adjacency.get(id) || []) dirtyConnections.add(connectionId);
    }

    for (const id of dirtyConnections) {
      const connection = this.#connections.get(id);
      if (connection) this.#drawConnection(connection);
      else this.#removeGraphic(id);
    }
  }

  #replaceConnectionIndex(connections) {
    this.#connections.clear();
    this.#adjacency.clear();
    for (const connection of connections) this.#replaceIndexedConnection(connection.id, connection);
  }

  #replaceIndexedConnection(id, connection) {
    const previous = this.#connections.get(id);
    if (previous) {
      this.#adjacency.get(previous.sourceCardId)?.delete(id);
      this.#adjacency.get(previous.targetCardId)?.delete(id);
    }
    if (!connection) {
      this.#connections.delete(id);
      if (this.#selectedId === id) this.#selectedId = null;
      return;
    }
    this.#connections.set(id, connection);
    for (const cardId of [connection.sourceCardId, connection.targetCardId]) {
      let ids = this.#adjacency.get(cardId);
      if (!ids) this.#adjacency.set(cardId, ids = new Set());
      ids.add(id);
    }
  }

  #refreshPins(drawings) {
    const activeIds = new Set(drawings.map(drawing => drawing.id));
    for (const id of this.#pins.keys()) {
      if (!activeIds.has(id)) this.#removePin(id);
    }
    for (const drawing of drawings) this.#drawPin(drawing);
  }

  #drawPin(drawing) {
    const pinPosition = this.#pinPosition(drawing.id);
    if (!pinPosition) {
      this.#removePin(drawing.id);
      return;
    }
    const document = drawing.document || drawing;
    const width = Number(document.shape?.width ?? 0);
    const size = Math.max(28, Math.min(52, width * 0.17)) * BOARD_PIN_SCALE;
    let entry = this.#pins.get(drawing.id);
    if (!entry || entry.container.destroyed) {
      const container = new PIXI.Container();
      container.label = `${MODULE_ID}-pin-${drawing.id}`;
      container.eventMode = "static";
      container.interactiveChildren = false;
      container.cursor = "pointer";
      container.mitBoardCardId = drawing.id;

      const fallback = new PIXI.Graphics();
      fallback.eventMode = "none";
      const sprite = new PIXI.Sprite(PIXI.Texture?.EMPTY);
      sprite.anchor?.set?.(0.5);
      sprite.eventMode = "none";
      sprite.visible = false;
      container.addChild(fallback, sprite);

      container.on("pointerdown", event => {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
        this.beginPinDrag(drawing.id, event);
      });
      container.on("pointertap", event => {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
        if (this.shouldSuppressPinTap()) return;
        void boardController.sealClicked(drawing.id);
      });
      this.#ensurePinContainer()?.addChild(container);
      entry = { container, fallback, sprite, path: null, loadGeneration: 0, hidden: false };
      this.#pins.set(drawing.id, entry);
    }

    entry.container.position.set(pinPosition.x, pinPosition.y);
    const hitSize = Math.max(24, size * 0.62);
    entry.container.hitArea = globalThis.PIXI?.Circle
      ? new PIXI.Circle(0, 0, hitSize)
      : new PIXI.Rectangle(-hitSize, -hitSize, hitSize * 2, hitSize * 2);
    entry.fallback.clear();
    entry.fallback.beginFill(0x8f1515, 1);
    entry.fallback.drawCircle(0, 0, size / 2);
    entry.fallback.endFill();
    entry.sprite.width = size;
    entry.sprite.height = size;
    entry.hidden = Boolean(document.hidden);
    entry.container.cursor = boardController.connectionModeActive ? "crosshair" : "pointer";
    entry.container.visible = !entry.hidden || Boolean(game.user?.isGM);
    this.#updatePinAlpha(drawing.id, entry);

    const path = getSetting("waxSealImage") || `modules/${MODULE_ID}/assets/wax-seal.svg`;
    if (entry.path !== path) this.#loadPinTexture(drawing.id, entry, path);
  }

  #loadPinTexture(drawingId, entry, path) {
    entry.path = path;
    entry.loadGeneration += 1;
    const generation = entry.loadGeneration;
    entry.sprite.visible = false;
    entry.fallback.visible = true;
    loadOptimizedTexture(path, {
      maxDimension: MAX_DECORATION_TEXTURE_DIMENSION,
      maxPixels: MAX_DECORATION_TEXTURE_PIXELS
    }).then(texture => {
      const current = this.#pins.get(drawingId);
      if (current !== entry || entry.loadGeneration !== generation || entry.container.destroyed) return;
      if (texture) entry.sprite.texture = texture;
      entry.sprite.visible = Boolean(texture);
      entry.fallback.visible = !texture;
    }).catch(() => {
      if (this.#pins.get(drawingId) !== entry || entry.loadGeneration !== generation) return;
      entry.sprite.visible = false;
      entry.fallback.visible = true;
    });
  }

  #updatePinAlpha(drawingId, entry = this.#pins.get(drawingId)) {
    if (!entry || entry.container.destroyed) return;
    if (entry.hidden && game.user?.isGM) entry.container.alpha = 0.4;
    else entry.container.alpha = drawingId === this.#activePinId ? 0.72 : 1;
  }

  setActivePin(drawingId = null) {
    const previous = this.#activePinId;
    this.#activePinId = drawingId || null;
    this.#updatePinAlpha(previous);
    this.#updatePinAlpha(this.#activePinId);
    for (const entry of this.#pins.values()) {
      entry.container.cursor = boardController.connectionModeActive ? "crosshair" : "pointer";
    }
  }

  invalidateTextures() {
    for (const entry of this.#pins.values()) entry.path = null;
    this.scheduleRefresh();
  }

  setCardDragPreviews(previews = []) {
    const dirty = new Set(this.#dragPositions.keys());
    this.#dragPositions.clear();
    for (const preview of previews) {
      if (!preview?.id || !Number.isFinite(Number(preview.x)) || !Number.isFinite(Number(preview.y))) continue;
      this.#dragPositions.set(preview.id, { x: Number(preview.x), y: Number(preview.y) });
      dirty.add(preview.id);
    }
    this.scheduleCardRefresh(dirty);
  }

  clearCardDragPreviews(drawingId = null) {
    const dirty = drawingId ? new Set([drawingId]) : new Set(this.#dragPositions.keys());
    if (drawingId) this.#dragPositions.delete(drawingId);
    else this.#dragPositions.clear();
    this.scheduleCardRefresh(dirty);
  }

  #pinPosition(drawingId) {
    const drawing = canvas?.drawings?.get?.(drawingId);
    if (!drawing) return null;
    if (drawing.document?.hidden && !game.user?.isGM) return null;
    const dragPosition = this.#dragPositions.get(drawingId);
    if (typeof drawing._getMitPinPosition === "function") {
      const position = drawing._getMitPinPosition();
      if (!dragPosition) return position;
      const documentX = Number(drawing.document?.x ?? drawing.x ?? 0);
      const documentY = Number(drawing.document?.y ?? drawing.y ?? 0);
      return {
        x: position.x + dragPosition.x - documentX,
        y: position.y + dragPosition.y - documentY
      };
    }
    const document = drawing.document;
    return {
      x: Number(dragPosition?.x ?? drawing.x ?? document?.x ?? 0) + Number(document?.shape?.width ?? 0) / 2,
      y: Number(dragPosition?.y ?? drawing.y ?? document?.y ?? 0)
    };
  }

  #installStageSelectionHandler() {
    const stage = canvas?.stage;
    if (!stage || this.#stageSelectionHandler) return;
    this.#stageSelectionHandler = event => {
      if (this.isDraggingPin || event?.shiftKey || Number(event?.button || 0) !== 0) return;
      if (this.#cardIdFromTarget(event?.target)) return;
      const point = event?.getLocalPosition?.(canvas?.drawings) || event?.global;
      if (!point) return;
      const connection = this.#connectionAtPoint(point);
      if (!connection) {
        if (this.#selectedId) this.select(null);
        return;
      }
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      event.stopPropagation?.();
      this.#handleConnectionTap(connection.id, event);
    };
    if (typeof stage.addEventListener === "function") {
      stage.addEventListener("pointerdown", this.#stageSelectionHandler, { capture: true });
      this.#stageSelectionUsesCapture = true;
    } else {
      stage.on("pointerdown", this.#stageSelectionHandler);
    }
  }

  #connectionAtPoint(point) {
    const zoom = Math.max(0.01, Math.abs(Number(canvas?.stage?.scale?.x || 1)));
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const connection of this.#connections.values()) {
      const start = this.#pinPosition(connection.sourceCardId);
      const end = this.#pinPosition(connection.targetCardId);
      if (!start || !end) continue;
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const sag = Math.max(18, distance * Number(connection.style?.sag ?? 0.12));
      const controlA = { x: start.x + (end.x - start.x) * 0.33, y: start.y + sag };
      const controlB = { x: start.x + (end.x - start.x) * 0.66, y: end.y + sag };
      let previous = start;
      let curveDistance = Number.POSITIVE_INFINITY;
      for (let index = 1; index <= 32; index += 1) {
        const current = this.#bezierPoint(index / 32, start, controlA, controlB, end);
        curveDistance = Math.min(curveDistance, this.#distanceToSegment(point, previous, current));
        previous = current;
      }
      const width = Math.max(1, Number(connection.style?.width ?? 4));
      const tolerance = Math.max(width + 10, 18 / zoom);
      if (curveDistance <= tolerance && curveDistance < nearestDistance) {
        nearest = connection;
        nearestDistance = curveDistance;
      }
    }
    return nearest;
  }

  #bezierPoint(t, start, controlA, controlB, end) {
    const inverse = 1 - t;
    const inverse2 = inverse * inverse;
    const t2 = t * t;
    return {
      x: (inverse2 * inverse * start.x) + (3 * inverse2 * t * controlA.x) + (3 * inverse * t2 * controlB.x) + (t2 * t * end.x),
      y: (inverse2 * inverse * start.y) + (3 * inverse2 * t * controlA.y) + (3 * inverse * t2 * controlB.y) + (t2 * t * end.y)
    };
  }

  #distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = (dx * dx) + (dy * dy);
    if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
    const projection = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSquared));
    return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
  }

  #drawConnection(connection) {
    const start = this.#pinPosition(connection.sourceCardId);
    const end = this.#pinPosition(connection.targetCardId);
    if (!start || !end) {
      this.#removeGraphic(connection.id);
      return;
    }

    let graphic = this.#graphics.get(connection.id);
    if (!graphic || graphic.destroyed) {
      graphic = new PIXI.Graphics();
      graphic.eventMode = "static";
      graphic.cursor = "pointer";
      graphic.on("rightclick", event => {
        event.stopPropagation();
        this.#openConnectionMenu(connection.id, event);
      });
      this.#ensureContainer()?.addChild(graphic);
      this.#graphics.set(connection.id, graphic);
    }

    graphic.clear();
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const sag = Math.max(18, distance * Number(connection.style?.sag ?? 0.12));
    const width = Math.max(1, Number(connection.style?.width ?? 4));
    const curve = path => path.moveTo(start.x, start.y).bezierCurveTo(
      start.x + (end.x - start.x) * 0.33,
      start.y + sag,
      start.x + (end.x - start.x) * 0.66,
      end.y + sag,
      end.x,
      end.y
    );

    // Keep a forgiving secondary hit geometry for the context menu. Left
    // selection is resolved geometrically at stage level so it remains
    // reliable regardless of the active Foundry canvas tool.
    strokePath(graphic, { color: 0x000000, width: Math.max(24, width + 20), alpha: 0.002 }, curve);
    if (this.#selectedId === connection.id) {
      strokePath(graphic, { color: 0xe4bd60, width: width + 5, alpha: 0.88 }, curve);
    }
    strokePath(graphic, { color: connection.style?.color || "#7b1010", width, alpha: 0.97 }, curve);
  }

  #handleConnectionTap(connectionId, event) {
    const now = globalThis.performance?.now?.() || Date.now();
    const explicitDoubleClick = Number(event?.detail || event?.nativeEvent?.detail || 0) >= 2;
    const repeatedTap = this.#lastLineTap.id === connectionId && (now - this.#lastLineTap.time) <= 350;
    this.select(connectionId);
    if (explicitDoubleClick || repeatedTap) {
      this.#lastLineTap = { id: null, time: 0 };
      this.#openConnectionEditor(connectionId);
    } else {
      this.#lastLineTap = { id: connectionId, time: now };
    }
  }

  #openConnectionEditor(connectionId) {
    const connection = this.#connections.get(connectionId);
    if (!connection) return;
    try {
      const rendered = new BoardConnectionSheet(connection).render({ force: true });
      if (rendered?.catch) rendered.catch(error => boardController.notifyError(error));
    } catch (error) {
      boardController.notifyError(error);
    }
  }

  select(connectionId) {
    const previous = this.#selectedId;
    this.#selectedId = connectionId || null;
    for (const id of [previous, this.#selectedId]) {
      if (!id) continue;
      const connection = this.#connections.get(id);
      if (connection) this.#drawConnection(connection);
    }
  }

  async deleteSelected() {
    if (!this.#selectedId || !game.user.isGM) return false;
    const id = this.#selectedId;
    this.select(null);
    try {
      await boardController.deleteConnection(id);
      return true;
    } catch (error) {
      boardController.notifyError(error);
      return false;
    }
  }

  beginPinDrag(drawingId, event) {
    if (!event?.shiftKey) return false;
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.Errors.PermissionDenied`));
      return true;
    }
    this.cancelPinDrag();
    this.#dragSourceId = drawingId;
    this.#suppressTapUntil = Number.POSITIVE_INFINITY;
    boardController.startConnection(drawingId);
    const stage = canvas?.stage;
    if (!stage) {
      this.cancelPinDrag();
      return true;
    }
    this.#stagePointerUpHandler = pointerEvent => {
      pointerEvent.stopPropagation?.();
      const targetId = this.#cardIdFromEvent(pointerEvent);
      void this.finishPinDrag(targetId);
    };
    stage.on("pointerup", this.#stagePointerUpHandler);
    stage.on("pointerupoutside", this.#stagePointerUpHandler);
    return true;
  }

  async finishPinDrag(targetId) {
    const sourceId = this.#dragSourceId;
    this.cancelPinDrag({ cancelConnection: false });
    boardController.cancelConnection();
    if (!sourceId || !targetId || sourceId === targetId) return false;
    try {
      const connection = await boardController.createConnection(sourceId, targetId);
      this.scheduleConnectionRefresh([connection?.id]);
      return true;
    } catch (error) {
      boardController.notifyError(error);
      return false;
    }
  }

  cancelPinDrag({ cancelConnection = true } = {}) {
    const stage = canvas?.stage;
    if (this.#stagePointerUpHandler && stage) {
      stage.off("pointerup", this.#stagePointerUpHandler);
      stage.off("pointerupoutside", this.#stagePointerUpHandler);
    }
    this.#stagePointerUpHandler = null;
    if (this.#dragSourceId) this.#suppressTapUntil = (globalThis.performance?.now?.() || Date.now()) + 350;
    this.#dragSourceId = null;
    this.stopPreview();
    if (cancelConnection && boardController.connectionModeActive) boardController.cancelConnection();
  }

  shouldSuppressPinTap() {
    const now = globalThis.performance?.now?.() || Date.now();
    return this.isDraggingPin || now < this.#suppressTapUntil;
  }

  #cardIdFromTarget(target) {
    let current = target;
    while (current) {
      if (current.mitBoardCardId) return current.mitBoardCardId;
      if (current === canvas?.stage) break;
      current = current.parent;
    }
    return null;
  }

  #cardIdFromEvent(event) {
    const direct = this.#cardIdFromTarget(event?.target);
    if (direct) return direct;
    const point = event?.getLocalPosition?.(canvas?.drawings) || event?.global;
    if (!point) return null;
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const drawing of boardController.cards()) {
      const pin = this.#pinPosition(drawing.id);
      if (!pin) continue;
      const distance = Math.hypot(point.x - pin.x, point.y - pin.y);
      if (distance <= 64 && distance < nearestDistance) {
        nearest = drawing.id;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  startPreview(drawingId) {
    this.stopPreview();
    const container = this.#ensureContainer();
    const start = this.#pinPosition(drawingId);
    if (!container || !start || !canvas?.stage) return;
    this.#preview = new PIXI.Graphics();
    this.#preview.eventMode = "none";
    container.addChild(this.#preview);
    this.#previewHandler = event => {
      const source = this.#pinPosition(drawingId);
      if (!source || !this.#preview) return;
      const target = event.getLocalPosition?.(canvas.drawings) || event.global;
      this.#preview.clear();
      const sag = Math.max(24, Math.hypot(target.x - source.x, target.y - source.y) * 0.12);
      strokePath(this.#preview, {
        color: getSetting("stringColor") || "#7b1010",
        width: Math.max(1, Number(getSetting("stringWidth") || 4)),
        alpha: 0.75
      }, path => (
        path.moveTo(source.x, source.y).bezierCurveTo(
          (source.x + target.x) / 2,
          source.y + sag,
          (source.x + target.x) / 2,
          target.y + sag,
          target.x,
          target.y
        )
      ));
    };
    canvas.stage.on("pointermove", this.#previewHandler);
  }

  stopPreview() {
    if (this.#previewHandler && canvas?.stage) canvas.stage.off("pointermove", this.#previewHandler);
    this.#previewHandler = null;
    if (this.#preview) {
      this.#preview.removeFromParent?.();
      this.#preview.destroy();
    }
    this.#preview = null;
  }

  #eventPosition(event) {
    const native = event?.nativeEvent || event?.data?.originalEvent || event?.originalEvent;
    return {
      x: Number(native?.clientX ?? event?.global?.x ?? 0),
      y: Number(native?.clientY ?? event?.global?.y ?? 0)
    };
  }

  #openConnectionMenu(connectionId, event) {
    const connection = this.#connections.get(connectionId);
    if (!connection) return;
    this.select(connectionId);
    const position = this.#eventPosition(event);
    const actions = [["Edit", () => this.#openConnectionEditor(connection.id)]];
    if (game.user.isGM) actions.push(["Delete", () => boardController.deleteConnection(connectionId)]);
    this.#openMenu(position, actions);
  }

  #openMenu(position, actions) {
    this.#menu?.remove();
    const menu = document.createElement("menu");
    menu.className = "mit-context-menu";
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;
    for (const [label, callback] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = game.i18n.localize(`${MODULE_ID}.Actions.${label}`);
      button.addEventListener("click", async () => {
        menu.remove();
        try { await callback(); } catch (error) { boardController.notifyError(error); }
      });
      menu.appendChild(button);
    }
    document.body.appendChild(menu);
    this.#menu = menu;
    setTimeout(() => document.addEventListener("pointerdown", closeEvent => {
      if (!menu.contains(closeEvent.target)) menu.remove();
    }, { once: true }), 0);
  }

  #removeGraphic(id) {
    const graphic = this.#graphics.get(id);
    graphic?.removeFromParent?.();
    graphic?.destroy?.();
    this.#graphics.delete(id);
  }

  #clearGraphics() {
    for (const id of [...this.#graphics.keys()]) this.#removeGraphic(id);
  }

  #removePin(id) {
    const entry = this.#pins.get(id);
    if (!entry) return;
    entry.loadGeneration += 1;
    entry.container?.removeFromParent?.();
    entry.container?.destroy?.({ children: true });
    this.#pins.delete(id);
  }

  #clearPins() {
    for (const id of [...this.#pins.keys()]) this.#removePin(id);
  }

  destroy() {
    if (this.#raf !== null) cancelAnimationFrame(this.#raf);
    this.#raf = null;
    this.cancelPinDrag({ cancelConnection: false });
    const stage = canvas?.stage;
    if (this.#stageSelectionHandler && stage) {
      if (this.#stageSelectionUsesCapture && typeof stage.removeEventListener === "function") {
        stage.removeEventListener("pointerdown", this.#stageSelectionHandler, { capture: true });
      } else {
        stage.off("pointerdown", this.#stageSelectionHandler);
      }
    }
    this.#stageSelectionHandler = null;
    this.#stageSelectionUsesCapture = false;
    this.#menu?.remove();
    this.#menu = null;
    this.#clearGraphics();
    this.#clearPins();
    if (this.#container) {
      try {
        this.#container.removeFromParent?.();
        this.#container.destroy({ children: true });
      } catch (_error) {
        // Canvas teardown may already have destroyed the layer.
      }
    }
    this.#container = null;
    if (this.#pinContainer) {
      try {
        this.#pinContainer.removeFromParent?.();
        this.#pinContainer.destroy({ children: true });
      } catch (_error) {
        // Canvas teardown may already have destroyed the layer.
      }
    }
    this.#pinContainer = null;
    this.#selectedId = null;
    this.#activePinId = null;
    this.#lastLineTap = { id: null, time: 0 };
    this.#dragPositions.clear();
    this.#connections.clear();
    this.#adjacency.clear();
    this.#dirtyCardIds.clear();
    this.#dirtyConnectionIds.clear();
    this.#fullRefreshPending = false;
  }
}

export const boardConnectionLayer = new BoardConnectionLayer();
