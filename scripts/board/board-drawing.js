import { BOARD_PIN_SCALE, DEFAULT_DEATH_OVERLAY_OPACITY, DEFEATED_OVERLAY_IMAGE, MODULE_ID } from "../constants.js";
import { createText, drawRoundedRect } from "../compatibility/pixi-graphics.js";
import { drawingDimensions, drawingElevation, confirmDialog } from "../compatibility/foundry-version.js";
import { migrateCard } from "../utils/migrations.js";
import { canViewDocument, resolveUuid } from "../utils/documents.js";
import { cardPresentation } from "./card-factory.js";
import { boardController } from "./board-controller.js";
import { openBoardCardSheet } from "./board-card-sheet.js";
import { openBoardNoteSheet } from "./board-note-sheet.js";
import { boardConnectionLayer } from "./board-connection-layer.js";
import { getSetting } from "../settings.js";
import { normalizeNoteText } from "./note-data.js";
import {
  loadOptimizedTexture,
  MAX_DECORATION_TEXTURE_DIMENSION,
  MAX_DECORATION_TEXTURE_PIXELS
} from "./image-texture-cache.js";

let installedClass = null;
let openMenu = null;

const MEDIEVAL_TITLE_FONT = '"Old English Text MT", "Copperplate Gothic Bold", "Palatino Linotype", Georgia, serif';
const NOTE_FONT = '"Almendra SC", "Palatino Linotype", Georgia, serif';
let noteFontPromise = null;

async function ensureNoteFont() {
  const fontSet = globalThis.document?.fonts;
  if (!fontSet?.load) return;
  noteFontPromise ||= fontSet.load('16px "Almendra SC"').catch(() => []);
  await noteFontPromise;
}

function isBoardCard(document) {
  return document?.flags?.[MODULE_ID]?.kind === "board-card";
}

function boardIsEnabled(document) {
  return isBoardCard(document) && boardController.isEnabled(document?.parent);
}

function eventPosition(event) {
  const native = event?.nativeEvent || event?.data?.originalEvent || event?.originalEvent;
  return {
    x: Number(native?.clientX ?? event?.global?.x ?? 0),
    y: Number(native?.clientY ?? event?.global?.y ?? 0)
  };
}

function closeContextMenu() {
  openMenu?.remove();
  openMenu = null;
}

function showContextMenu(position, actions) {
  closeContextMenu();
  const menu = document.createElement("menu");
  menu.className = "mit-context-menu";
  menu.setAttribute("aria-label", game.i18n.localize(`${MODULE_ID}.Labels.ContextMenu`));
  menu.style.left = `${position.x}px`;
  menu.style.top = `${position.y}px`;
  for (const [label, callback] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = game.i18n.localize(`${MODULE_ID}.Actions.${label}`);
    button.addEventListener("click", async () => {
      closeContextMenu();
      try { await callback(); } catch (error) { boardController.notifyError(error); }
    });
    menu.appendChild(button);
  }
  document.body.appendChild(menu);
  openMenu = menu;
  setTimeout(() => document.addEventListener("pointerdown", event => {
    if (!menu.contains(event.target)) closeContextMenu();
  }, { once: true }), 0);
}

async function openSource(drawing) {
  const source = await resolveUuid(drawing?.flags?.[MODULE_ID]?.sourceUuid);
  if (!source || !canViewDocument(source) || !source.sheet?.render) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.Errors.PermissionDenied`));
    return;
  }
  source.sheet.render({ force: true });
}

async function deleteCard(drawing) {
  const connections = boardController.getState(drawing.parent).connections.filter(connection => (
    connection.sourceCardId === drawing.id || connection.targetCardId === drawing.id
  ));
  if (connections.length && getSetting("confirmDelete")) {
    const confirmed = await confirmDialog({
      title: game.i18n.localize(`${MODULE_ID}.Confirm.DeleteCardTitle`),
      content: `<p>${game.i18n.format(`${MODULE_ID}.Confirm.DeleteConnectedCard`, { count: connections.length })}</p>`,
      yes: game.i18n.localize(`${MODULE_ID}.Actions.Delete`),
      no: game.i18n.localize(`${MODULE_ID}.Actions.Cancel`)
    });
    if (!confirmed) return;
  }
  await boardController.deleteCard(drawing.id, drawing.parent);
}

function cardMenu(drawing, event) {
  const cards = boardController.cards(drawing.parent);
  const isNote = drawing.flags?.[MODULE_ID]?.cardType === "free";
  const editCard = () => isNote
    ? openBoardNoteSheet({ drawing })
    : openBoardCardSheet({ drawing });
  const actions = [
    ["Edit", editCard],
    ["Duplicate", () => boardController.duplicateCard(drawing.id, drawing.parent)],
    ["BringFront", () => boardController.moveCard(drawing.id, {
      z: Math.max(0, ...cards.map(drawingElevation)) + 1
    }, drawing.parent)],
    ["SendBack", () => boardController.moveCard(drawing.id, {
      z: Math.min(0, ...cards.map(drawingElevation)) - 1
    }, drawing.parent)]
  ];
  if (!game.user.isGM) {
    showContextMenu(eventPosition(event), [["Edit", editCard]]);
    return;
  }
  if (!isNote) actions.push(["OpenSource", () => openSource(drawing)]);
  actions.push(["Delete", () => deleteCard(drawing)]);
  showContextMenu(eventPosition(event), actions);
}

function addDisplayChild(container, child) {
  child.eventMode = "none";
  container.addChild(child);
  return child;
}

async function loadSprite(path, limits = {}) {
  if (!path) return null;
  try {
    const texture = await loadOptimizedTexture(path, limits);
    return texture ? new PIXI.Sprite(texture) : null;
  } catch (_error) {
    return null;
  }
}

function fitContain(sprite, x, y, width, height) {
  const textureWidth = Number(sprite.texture?.orig?.width || sprite.texture?.width || 1);
  const textureHeight = Number(sprite.texture?.orig?.height || sprite.texture?.height || 1);
  const scale = Math.min(width / textureWidth, height / textureHeight);
  sprite.width = textureWidth * scale;
  sprite.height = textureHeight * scale;
  sprite.x = x + (width - sprite.width) / 2;
  sprite.y = y + (height - sprite.height) / 2;
}

function hasCardTag(card, tag) {
  return Array.isArray(card?.tags) && card.tags.includes(tag);
}

async function addDeathOverlay(container, { x, y, width, height }) {
  const overlay = await loadSprite(DEFEATED_OVERLAY_IMAGE, {
    maxDimension: MAX_DECORATION_TEXTURE_DIMENSION,
    maxPixels: MAX_DECORATION_TEXTURE_PIXELS
  });
  if (!overlay) return null;
  fitContain(overlay, x, y, width, height);
  const configuredOpacity = Number(getSetting("deathOverlayOpacity"));
  overlay.alpha = Number.isFinite(configuredOpacity)
    ? Math.min(1, Math.max(0, configuredOpacity))
    : DEFAULT_DEATH_OVERLAY_OPACITY;
  overlay.zIndex = 20;
  addDisplayChild(container, overlay);
  return overlay;
}

function addText(container, value, style, { x = 0, y = 0, anchorX = 0, anchorY = 0 } = {}) {
  const display = createText(PIXI, String(value || ""), style);
  display.anchor?.set?.(anchorX, anchorY);
  display.position?.set?.(x, y);
  addDisplayChild(container, display);
  return display;
}

function addFittedText(container, value, style, {
  x = 0,
  y = 0,
  anchorX = 0,
  anchorY = 0,
  maxWidth = Number.POSITIVE_INFINITY,
  maxHeight = Number.POSITIVE_INFINITY,
  minimumFontSize = 10
} = {}) {
  let text = String(value || "");
  const display = createText(PIXI, text, { ...style });
  const updateMetrics = () => {
    display.updateText?.(true);
    return display.width <= maxWidth + 1 && display.height <= maxHeight + 1;
  };
  let fontSize = Math.max(minimumFontSize, Number(display.style?.fontSize || style.fontSize || minimumFontSize));
  while (!updateMetrics() && fontSize > minimumFontSize) {
    fontSize -= 1;
    display.style.fontSize = fontSize;
  }
  for (let attempts = 0; !updateMetrics() && text.length > 12 && attempts < 30; attempts += 1) {
    const keep = Math.max(12, Math.floor((text.length - 1) * 0.88));
    text = `${text.slice(0, keep).trimEnd()}…`;
    display.text = text;
  }
  display.anchor?.set?.(anchorX, anchorY);
  display.position?.set?.(x, y);
  addDisplayChild(container, display);
  return display;
}

/**
 * Install a Drawing subclass at init/setup time. The current object class is
 * extended instead of the core class directly, so this remains composable with
 * other Drawing modules (including Investigation Board itself).
 */
export function installBoardDrawingClass() {
  const configured = globalThis.CONFIG?.Drawing?.objectClass;
  const fallback = globalThis.foundry?.canvas?.placeables?.Drawing;
  const BaseDrawing = configured || fallback;
  if (!BaseDrawing || configured?.mitBoardDrawingClass) return Boolean(BaseDrawing);

  class BoardDrawing extends BaseDrawing {
    static mitBoardDrawingClass = true;

    constructor(...args) {
      super(...args);
      this._mitArt = null;
      this._mitFingerprint = null;
      this._mitRenderRunning = false;
      this._mitRenderQueued = false;
      this._mitRenderFrame = null;
      this._mitBackground = null;
      this._mitRenderedSize = null;
    }

    get isVisible() {
      if (boardIsEnabled(this.document)) return !this.document.hidden || Boolean(game.user?.isGM);
      return super.isVisible;
    }

    _canControl(user, event) {
      if (boardIsEnabled(this.document)) return true;
      return super._canControl(user, event);
    }

    _canDrag(user, event) {
      if (boardIsEnabled(this.document)) return Boolean(user?.isGM) && !this.document.locked;
      return super._canDrag(user, event);
    }

    _canView(user, event) {
      if (boardIsEnabled(this.document)) return !this.document.hidden || Boolean(user?.isGM);
      return super._canView?.(user, event) ?? true;
    }

    _canConfigure(user, event) {
      if (boardIsEnabled(this.document)) return true;
      return super._canConfigure(user, event);
    }

    canUserModify(user, action) {
      if (boardIsEnabled(this.document)) return Boolean(user?.isGM);
      return super.canUserModify(user, action);
    }

    testUserPermission(user, permission, { exact = false } = {}) {
      if (boardIsEnabled(this.document)) {
        const levels = foundry.CONST?.DOCUMENT_OWNERSHIP_LEVELS || CONST.DOCUMENT_OWNERSHIP_LEVELS;
        const requested = typeof permission === "string" ? levels?.[permission] : permission;
        const maximum = user?.isGM ? levels?.OWNER : levels?.OBSERVER;
        if (Number(requested) <= Number(maximum)) return true;
      }
      return super.testUserPermission(user, permission, { exact });
    }

    activateListeners() {
      super.activateListeners();
      if (boardIsEnabled(this.document) && this.mouseInteractionManager) {
        this.mouseInteractionManager.permissions.clickRight = () => true;
        this.mouseInteractionManager.permissions.clickRight2 = () => true;
      }
    }

    _refreshState() {
      super._refreshState();
      if (!boardIsEnabled(this.document)) return;
      // The detached pin layer and the Drawing art must use the exact same
      // visibility rule. Foundry's native Drawing shape is the authoritative
      // rendered surface for players, even while the Drawings tool is inactive.
      const visible = !this.document.hidden || Boolean(game.user?.isGM);
      this.visible = visible;
      if (this.shape) this.shape.visible = visible;
      if (this._mitArt) this._mitArt.visible = visible;
      // Investigation Board keeps its notes interactive outside the native
      // Drawing tool. Doing the same here lets cards and the separate pin
      // layer work without switching canvas controls.
      this.eventMode = this.visible ? "static" : "none";
      this.interactiveChildren = true;
      this.cursor = this.document.locked ? "default" : "pointer";
    }

    _applyRenderFlags(flags) {
      super._applyRenderFlags(flags);
      if (!boardIsEnabled(this.document)) {
        this._destroyMitArt();
        return;
      }
      // Foundry v13 resizes Drawings through incremental render flags rather
      // than refresh(). Reflow the true image surface, portrait, text and pin on the
      // latest source dimensions during the handle drag.
      const { width, height } = drawingDimensions(this.document);
      const sizeChanged = !this._mitRenderedSize
        || this._mitRenderedSize.width !== width
        || this._mitRenderedSize.height !== height;
      if (flags.redraw || flags.refresh || flags.refreshSize || flags.refreshShape || sizeChanged) {
        this._resizeMitBackground();
        this.refreshMitCard();
      } else if (flags.refreshTransform) {
        // Position-only changes must not recreate textures and text on every
        // drag frame. Connections receive the live clone position separately.
        boardConnectionLayer.scheduleCardRefresh([this.document.id]);
      }
    }

    _onClickLeft2(event) {
      if (!boardIsEnabled(this.document)) return super._onClickLeft2(event);
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      event.stopPropagation?.();
      if (this.document.flags?.[MODULE_ID]?.cardType === "free") {
        openBoardNoteSheet({ drawing: this.document });
      } else {
        openBoardCardSheet({ drawing: this.document });
      }
      return false;
    }

    _onClickRight(event) {
      if (!boardIsEnabled(this.document)) return super._onClickRight(event);
      event.stopPropagation?.();
      cardMenu(this.document, event);
    }

    _onClickRight2(event) {
      if (!boardIsEnabled(this.document)) return super._onClickRight2(event);
      event.stopPropagation?.();
      cardMenu(this.document, event);
    }

    _onHandleDragMove(event) {
      const result = super._onHandleDragMove(event);
      if (!boardIsEnabled(this.document)) return result;
      const minimum = Math.max(1, Number(getSetting("minimumCardSize") || 120));
      const width = Math.max(minimum, Number(this.document.shape?.width || minimum));
      const height = Math.max(minimum, Number(this.document.shape?.height || minimum));
      if (width !== this.document.shape?.width || height !== this.document.shape?.height) {
        this.document.updateSource({ shape: { width, height } });
        this.renderFlags?.set?.({ refreshTransform: true });
      }
      return result;
    }

    _onDragLeftMove(event) {
      const result = super._onDragLeftMove(event);
      if (!boardIsEnabled(this.document) || event.interactionData?.dragHandle) return result;
      const previews = (event.interactionData?.clones || [])
        .filter(clone => clone?._original?.document?.flags?.[MODULE_ID]?.kind === "board-card")
        .map(clone => ({
          id: clone._original.document.id,
          x: clone.document.x,
          y: clone.document.y
        }));
      boardConnectionLayer.setCardDragPreviews(previews);
      return result;
    }

    _onDragLeftCancel(event) {
      const result = super._onDragLeftCancel(event);
      if (boardIsEnabled(this.document) && !event.interactionData?.dragHandle) {
        boardConnectionLayer.clearCardDragPreviews();
      }
      return result;
    }

    _onDragEnd() {
      const drawingId = this._original?.document?.id || this.document?.id;
      const result = super._onDragEnd();
      boardConnectionLayer.clearCardDragPreviews(drawingId);
      return result;
    }

    async draw() {
      await super.draw();
      await this._renderMitCard();
      return this;
    }

    async refresh() {
      await super.refresh();
      await this._renderMitCard();
      boardConnectionLayer.scheduleCardRefresh([this.document.id]);
      return this;
    }

    _destroy(options) {
      this._destroyMitArt();
      return super._destroy(options);
    }

    invalidateMitCard() {
      this._mitFingerprint = null;
    }

    _resizeMitBackground() {
      if (!this._mitBackground || this._mitBackground.destroyed) return;
      const { width, height } = drawingDimensions(this.document);
      this._mitBackground.position.set(0, 0);
      // The selected parchment/reference is the card surface itself. It is
      // deliberately stretched to the exact Drawing dimensions on each
      // Foundry resize flag so no native Drawing can show around it.
      this._mitBackground.width = width;
      this._mitBackground.height = height;
    }

    refreshMitCard() {
      this.invalidateMitCard();
      if (this._mitRenderFrame !== null) return;
      const schedule = globalThis.requestAnimationFrame || (callback => globalThis.setTimeout(callback, 0));
      this._mitRenderFrame = schedule(() => {
        this._mitRenderFrame = null;
        void this._renderMitCard();
        boardConnectionLayer.scheduleCardRefresh([this.document.id]);
      });
    }

    async _renderMitCard() {
      if (!boardIsEnabled(this.document)) {
        this._destroyMitArt();
        return;
      }
      if (this._mitRenderRunning) {
        this._mitRenderQueued = true;
        return;
      }
      this._mitRenderRunning = true;
      try {
        await this._doRenderMitCard();
      } finally {
        this._mitRenderRunning = false;
        if (this._mitRenderQueued) {
          this._mitRenderQueued = false;
          void this._renderMitCard();
        }
      }
    }

    async _doRenderMitCard() {
      const card = migrateCard(this.document.flags[MODULE_ID]);
      const { width, height } = drawingDimensions(this.document);
      const fingerprint = JSON.stringify({ width, height, card, hidden: this.document.hidden });
      if (this._mitArt?.parent === this.shape && this._mitFingerprint === fingerprint) return;

      const source = await resolveUuid(card.sourceUuid);
      // The card's visibility toggles are an explicit publication choice by
      // its author. They control what appears on the shared board independently
      // of the player's permission to open the source document itself.
      const presentation = await cardPresentation(card, source);
      const currentFingerprint = JSON.stringify({
        width: drawingDimensions(this.document).width,
        height: drawingDimensions(this.document).height,
        card: migrateCard(this.document.flags[MODULE_ID]),
        hidden: this.document.hidden
      });
      if (currentFingerprint !== fingerprint) {
        this._mitRenderQueued = true;
        return;
      }

      this._destroyMitArt();
      const art = new PIXI.Container();
      art.label = `${MODULE_ID}-card-art`;
      art.eventMode = "none";
      art.interactiveChildren = false;
      art.sortableChildren = true;
      // Foundry renders Drawing.shape inside canvas.interface or canvas.primary.
      // Attaching card art to the placeable interaction container made it
      // visible to a GM on the active layer but not reliably to players.
      this.shape.addChild(art);
      this._mitArt = art;
      this._mitFingerprint = fingerprint;
      this._mitRenderedSize = { width, height };

      if (card.cardType === "free") {
        await ensureNoteFont();
        const bannerPath = getSetting("noteBannerImage") || "";
        let banner = bannerPath ? await loadSprite(bannerPath) : null;
        if (banner) {
          banner.position.set(0, 0);
          banner.width = width;
          banner.height = height;
          addDisplayChild(art, banner);
          this._mitBackground = banner;
        } else {
          banner = new PIXI.Graphics();
          drawRoundedRect(banner, 0, 0, width, height, 0, { color: 0x742839, alpha: 1 });
          addDisplayChild(art, banner);
          this._mitBackground = banner;
        }
        const noteText = normalizeNoteText(card.titleOverride || card.text)
          || game.i18n.localize(`${MODULE_ID}.Labels.NoteDefault`);
        const notePadding = Math.max(10, Math.min(width, height) * 0.12);
        const label = addFittedText(art, noteText, {
          fontFamily: NOTE_FONT,
          fontSize: Math.max(14, Math.min(36, width * 0.42, height * 0.14)),
          fontWeight: "normal",
          fill: 0x000000,
          stroke: 0xf3e2bd,
          strokeThickness: Math.max(1, Math.min(3, width * 0.018)),
          letterSpacing: Math.max(0, Math.min(2, height * 0.006)),
          wordWrap: false,
          align: "center"
        }, {
          x: width / 2,
          y: height / 2,
          anchorX: 0.5,
          anchorY: 0.5,
          maxWidth: Math.max(20, height - notePadding * 2),
          maxHeight: Math.max(20, width - notePadding * 2),
          minimumFontSize: 10
        });
        label.rotation = getSetting("noteTextDirection") === "left" ? -Math.PI / 2 : Math.PI / 2;
        boardConnectionLayer.scheduleCardRefresh([this.document.id]);
        return;
      }

      const radius = Math.max(8, Math.min(20, width * 0.045));
      const genericParchment = `modules/${MODULE_ID}/assets/parchment.svg`;
      const canShowReferenceImage = card.showImage;
      // A Document card only uses an explicitly chosen reference image as its
      // surface. Source-document icons are deliberately ignored: resetting or
      // omitting the image always restores the bundled generic parchment.
      const documentReferenceImage = canShowReferenceImage ? card.imageOverride : "";
      const backgroundPath = card.cardType === "document"
        ? (documentReferenceImage || genericParchment)
        : (getSetting("parchmentTexture") || genericParchment);
      let background = await loadSprite(backgroundPath);
      if (!background && backgroundPath !== genericParchment) background = await loadSprite(genericParchment);
      if (background) {
        background.position.set(0, 0);
        background.width = width;
        background.height = height;
        addDisplayChild(art, background);
        this._mitBackground = background;
      } else {
        const fallback = new PIXI.Graphics();
        drawRoundedRect(fallback, 0, 0, width, height, 0, { color: 0xe5d09b, alpha: 1 });
        addDisplayChild(art, fallback);
      }

      const padding = Math.max(12, width * 0.055);
      const dead = card.cardType === "actor" && hasCardTag(card, "dead");
      let cursorY = padding + Math.max(14, height * 0.025);
      const showImage = card.showImage;
      const showName = card.showName;
      let imagePath = card.cardType === "document" ? "" : (showImage ? presentation.image : "");
      if (!card.sourceUuid && !card.imageOverride) imagePath = "";
      if (!showImage && card.cardType === "actor") {
        imagePath = getSetting("unknownActorImage") || `modules/${MODULE_ID}/assets/unknown-person.svg`;
      }

      if (imagePath) {
        const portrait = await loadSprite(imagePath);
        if (portrait) {
          const imageX = padding;
          const imageY = cursorY;
          const imageWidth = Math.max(1, width - padding * 2);
          const reservedTextHeight = Math.max(44, height * 0.2);
          const imageHeight = Math.max(1, Math.min(
            height * 0.52,
            height - (padding * 2.6) - reservedTextHeight
          ));
          fitContain(portrait, imageX, imageY, imageWidth, imageHeight);
          const mask = new PIXI.Graphics();
          drawRoundedRect(mask, imageX, imageY, imageWidth, imageHeight, Math.max(5, radius * 0.6), {
            color: 0xffffff,
            alpha: 1
          });
          art.addChild(portrait, mask);
          portrait.eventMode = "none";
          mask.eventMode = "none";
          portrait.mask = mask;
          if (dead) await addDeathOverlay(art, {
            x: portrait.x,
            y: portrait.y,
            width: portrait.width,
            height: portrait.height
          });
          cursorY += imageHeight + padding * 0.62;
        }
      }

      const titleValue = showName
        ? (presentation.title || game.i18n.localize(`${MODULE_ID}.Labels.Untitled`))
        : game.i18n.localize(`${MODULE_ID}.Labels.UnknownIdentity`);
      const titleMaxHeight = Math.max(34, Math.min(90, height * 0.22));
      const title = addFittedText(art, String(titleValue).slice(0, 180), {
        fontFamily: MEDIEVAL_TITLE_FONT,
        fontSize: Math.max(14, Math.min(30, width * 0.09)),
        fontWeight: "normal",
        fill: 0x302014,
        stroke: 0xf3e5bf,
        strokeThickness: Math.max(1, Math.min(3, width * 0.007)),
        letterSpacing: Math.max(0, Math.min(1.2, width * 0.0025)),
        wordWrap: true,
        wordWrapWidth: Math.max(20, width - padding * 2),
        align: "center"
      }, {
        x: width / 2,
        y: cursorY,
        anchorX: 0.5,
        anchorY: 0,
        maxWidth: Math.max(20, width - padding * 2),
        maxHeight: titleMaxHeight,
        minimumFontSize: 10
      });
      if ((presentation.missing || !card.showName || !card.showImage) && game.user.isGM) {
        addText(art, "●", {
          fontFamily: "Arial",
          fontSize: Math.max(11, width * 0.045),
          fill: presentation.missing ? 0xb32424 : 0x6b5520
        }, { x: width - padding, y: height - padding, anchorX: 1, anchorY: 1 });
      }

      boardConnectionLayer.scheduleCardRefresh([this.document.id]);
    }

    _getMitPinPosition() {
      const card = migrateCard(this.document.flags[MODULE_ID]);
      const { width } = drawingDimensions(this.document);
      const size = Math.max(28, Math.min(52, width * 0.17)) * BOARD_PIN_SCALE;
      return {
        x: Number(this.x ?? this.document.x ?? 0) + width / 2 + Number(card.pin?.offsetX || 0),
        y: Number(this.y ?? this.document.y ?? 0) + Math.max(size * 0.32, Number(card.pin?.offsetY || 0))
      };
    }

    _destroyMitArt() {
      if (this._mitRenderFrame !== null) {
        const cancel = globalThis.cancelAnimationFrame || globalThis.clearTimeout;
        cancel?.(this._mitRenderFrame);
        this._mitRenderFrame = null;
      }
      this._mitBackground = null;
      if (!this._mitArt) return;
      try {
        this._mitArt.removeFromParent?.();
        this._mitArt.destroy({ children: true });
      } catch (_error) {
        // The canvas may already have destroyed the placeable.
      }
      this._mitArt = null;
      this._mitFingerprint = null;
      this._mitRenderedSize = null;
    }
  }

  installedClass = BoardDrawing;
  CONFIG.Drawing.objectClass = BoardDrawing;
  return true;
}

export function getInstalledBoardDrawingClass() {
  return installedClass;
}
