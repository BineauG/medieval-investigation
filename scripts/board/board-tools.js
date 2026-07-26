import { MODULE_ID } from "../constants.js";
import { addSceneTool, rerenderSceneControls } from "../compatibility/foundry-version.js";
import { openBoardCardSheet } from "./board-card-sheet.js";
import { boardController } from "./board-controller.js";
import { boardConnectionLayer } from "./board-connection-layer.js";
import { cardFromDrop } from "./card-factory.js";
import { notifyGraphActorChanged, notifyGraphAssetsChanged, notifyGraphPageUpdated, openRelationGraph } from "../graph/relation-graph-app.js";
import { getSetting } from "../settings.js";
import { confirmDialog } from "../compatibility/foundry-version.js";
import { registerDocumentContextMenus } from "./document-context.js";
import { createCardData } from "./board-data.js";
import { clearOptimizedTextureCache } from "./image-texture-cache.js";

function rootElement(html) {
  return html instanceof HTMLElement ? html : html?.[0] || null;
}

function boardPosition() {
  const scene = canvas.scene;
  return { x: scene.width / 2, y: scene.height / 2 };
}

function gmCanCreate() {
  return Boolean(game.user.isGM);
}

function boardPatch(changes) {
  return changes?.flags?.[MODULE_ID]?.investigationBoard || null;
}

function changedConnectionIds(patch, options = {}) {
  const explicit = Array.isArray(options?.mitConnectionIds) ? options.mitConnectionIds : [];
  if (explicit.length) return [...new Set(explicit.filter(Boolean))];
  const indexed = patch?.connectionsById;
  if (!indexed || typeof indexed !== "object" || Array.isArray(indexed)) return [];
  return [...new Set(Object.keys(indexed).map(id => id.startsWith("-=") ? id.slice(2) : id).filter(Boolean))];
}

export function registerBoardHooks() {
  registerDocumentContextMenus();

  Hooks.on("getSceneControlButtons", controls => {
    const enabled = boardController.isEnabled();
    addSceneTool(controls, "drawings", {
      name: "mitToggleBoard",
      title: `${MODULE_ID}.Controls.ToggleBoard`,
      icon: "fa-solid fa-map",
      button: true,
      visible: game.user.isGM,
      active: enabled,
      onChange: () => boardController.toggle().catch(error => boardController.notifyError(error))
    });
    if (enabled) {
      addSceneTool(controls, "drawings", {
        name: "mitActorCard",
        title: `${MODULE_ID}.Controls.ActorCard`,
        icon: "fa-solid fa-user-secret",
        button: true,
        visible: gmCanCreate(),
        onChange: (_event, active) => {
          if (active) openBoardCardSheet({ initial: { cardType: "actor" }, position: boardPosition() });
        }
      });
      addSceneTool(controls, "drawings", {
        name: "mitDocumentCard",
        title: `${MODULE_ID}.Controls.DocumentCard`,
        icon: "fa-solid fa-file-lines",
        button: true,
        visible: gmCanCreate(),
        onChange: (_event, active) => {
          if (active) openBoardCardSheet({ initial: { cardType: "document" }, position: boardPosition() });
        }
      });
      addSceneTool(controls, "drawings", {
        name: "mitFreeCard",
        title: `${MODULE_ID}.Controls.FreeCard`,
        icon: "fa-solid fa-bookmark",
        button: true,
        visible: true,
        onChange: (_event, active) => {
          if (!active) return;
          const note = createCardData({
            cardType: "free",
            titleOverride: game.i18n.localize(`${MODULE_ID}.Labels.NoteDefault`),
            showImage: false
          }, { userId: game.user.id });
          boardController.createCard(note, boardPosition()).catch(error => boardController.notifyError(error));
        }
      });
      addSceneTool(controls, "drawings", {
        name: "mitConnections",
        title: `${MODULE_ID}.Controls.Connections`,
        icon: "fa-solid fa-link",
        button: true,
        visible: true,
        onChange: (_event, active) => {
          if (active) boardController.startConnection(null, { announce: true });
        }
      });
    }
    addSceneTool(controls, "notes", {
      name: "mitRelationGraph",
      title: `${MODULE_ID}.Controls.RelationGraph`,
      icon: "fa-solid fa-diagram-project",
      button: true,
      visible: true,
      onChange: () => openRelationGraph().catch(error => boardController.notifyError(error))
    });
  });

  Hooks.on("renderSceneConfig", (_app, html) => {
    const root = rootElement(html);
    const form = root?.querySelector("form") || root;
    if (!form || form.querySelector("[name='flags.medieval-investigation-toolkit.investigationBoard.enabled']")) return;
    const group = document.createElement("div");
    group.className = "form-group";
    const label = document.createElement("label");
    label.textContent = game.i18n.localize(`${MODULE_ID}.SceneConfig.BoardEnabled`);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = `flags.${MODULE_ID}.investigationBoard.enabled`;
    input.checked = Boolean(_app.document?.getFlag(MODULE_ID, "investigationBoard")?.enabled);
    group.append(label, input);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = game.i18n.localize(`${MODULE_ID}.SceneConfig.BoardEnabledHint`);
    group.appendChild(hint);
    const footer = form.querySelector("footer");
    if (footer) footer.before(group);
    else form.appendChild(group);
  });

  Hooks.on("dropCanvasData", (_canvas, data) => {
    if (!boardController.isEnabled() || !gmCanCreate() || (!data?.uuid && data?.type !== "Actor")) return;
    (async () => {
      try {
        const card = await cardFromDrop(data);
        await boardController.createCard(card, { x: data.x, y: data.y });
      } catch (error) {
        boardController.notifyError(error);
      }
    })();
    return false;
  });

  Hooks.on("canvasReady", async () => {
    if (game.user.isGM && boardController.hasState()) await boardController.migrateScene();
    boardConnectionLayer.initialize();
    rerenderSceneControls();
  });
  Hooks.on("canvasTearDown", () => {
    boardConnectionLayer.destroy();
    clearOptimizedTextureCache();
  });
  Hooks.on("drawDrawing", drawing => {
    if (drawing.document?.flags?.[MODULE_ID]?.kind === "board-card") {
      boardConnectionLayer.scheduleCardRefresh([drawing.document.id]);
    }
  });
  Hooks.on("refreshDrawing", drawing => {
    if (drawing.document?.flags?.[MODULE_ID]?.kind === "board-card") {
      boardConnectionLayer.scheduleCardRefresh([drawing.document.id]);
    }
  });
  Hooks.on("updateDrawing", (drawing, changes) => {
    if (drawing.flags?.[MODULE_ID]?.kind === "board-card") {
      boardConnectionLayer.clearCardDragPreviews(drawing.id);
      const visualChanged = Boolean(changes?.flags?.[MODULE_ID])
        || Boolean(changes?.shape)
        || Object.hasOwn(changes || {}, "hidden");
      if (visualChanged) canvas.drawings?.get?.(drawing.id)?.refreshMitCard?.();
      boardConnectionLayer.scheduleCardRefresh([drawing.id]);
    }
  });
  Hooks.on("deleteDrawing", drawing => boardConnectionLayer.scheduleCardRefresh([drawing.id]));
  Hooks.on("updateScene", (scene, changes, options = {}) => {
    const patch = boardPatch(changes);
    if (!patch) return;
    boardController.invalidateState(scene);
    if (scene.id !== canvas?.scene?.id) return;
    const changeKind = options?.mitBoardChange || "";
    const enabledChanged = changeKind === "enabled"
      || (!changeKind && Object.hasOwn(patch, "enabled")
        && !Object.hasOwn(patch, "connections")
        && !Object.hasOwn(patch, "connectionsById"));
    if (enabledChanged) {
      for (const drawing of canvas?.drawings?.placeables || []) {
        if (drawing.document?.flags?.[MODULE_ID]?.kind !== "board-card") continue;
        drawing.renderFlags?.set?.({ refreshState: true, refreshSize: true });
        drawing.refreshMitCard?.();
      }
      boardConnectionLayer.initialize();
      rerenderSceneControls();
      return;
    }
    const ids = changedConnectionIds(patch, options);
    if (ids.length && changeKind !== "migration") boardConnectionLayer.scheduleConnectionRefresh(ids);
    else boardConnectionLayer.scheduleRefresh();
  });
  Hooks.on("updateJournalEntryPage", page => notifyGraphPageUpdated(page));
  Hooks.on("updateActor", actor => notifyGraphActorChanged(actor, false));
  Hooks.on("deleteActor", actor => notifyGraphActorChanged(actor, true));

  const refreshSourceCards = source => {
    if (!canvas?.ready) return;
    for (const drawing of canvas.drawings?.placeables || []) {
      if (drawing.document?.flags?.[MODULE_ID]?.sourceUuid !== source.uuid) continue;
      drawing.refreshMitCard?.();
    }
  };
  for (const type of ["Actor", "Item", "JournalEntry", "JournalEntryPage", "RollTable", "Macro", "Cards"]) {
    Hooks.on(`update${type}`, refreshSourceCards);
    Hooks.on(`delete${type}`, refreshSourceCards);
  }

  Hooks.on("preUpdateDrawing", (drawing, changes, options, userId) => {
    if (drawing.flags?.[MODULE_ID]?.kind !== "board-card") return;
    if (changes.shape) {
      const minimum = Math.max(1, Number(getSetting("minimumCardSize") || 120));
      if (Number.isFinite(Number(changes.shape.width))) changes.shape.width = Math.max(minimum, Number(changes.shape.width));
      if (Number.isFinite(Number(changes.shape.height))) changes.shape.height = Math.max(minimum, Number(changes.shape.height));
    }
    if (game.user.isGM || userId !== game.user.id || options?.mitAuthorized) return;
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.Errors.PermissionDenied`));
    return false;
  });

  Hooks.on("preDeleteDrawing", (drawing, options, userId) => {
    if (drawing.flags?.[MODULE_ID]?.kind !== "board-card" || options?.mitConfirmed || userId !== game.user.id) return;
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.Errors.PermissionDenied`));
      return false;
    }
    const linked = boardController.getState(drawing.parent).connections.filter(connection => connection.sourceCardId === drawing.id || connection.targetCardId === drawing.id);
    (async () => {
      if (linked.length && getSetting("confirmDelete")) {
        const confirmed = await confirmDialog({
          title: game.i18n.localize(`${MODULE_ID}.Confirm.DeleteCardTitle`),
          content: `<p>${game.i18n.format(`${MODULE_ID}.Confirm.DeleteConnectedCard`, { count: linked.length })}</p>`,
          yes: game.i18n.localize(`${MODULE_ID}.Actions.Delete`),
          no: game.i18n.localize(`${MODULE_ID}.Actions.Cancel`)
        });
        if (!confirmed) return;
      }
      await boardController.deleteCard(drawing.id, drawing.parent);
    })().catch(error => boardController.notifyError(error));
    return false;
  });

  document.addEventListener("keydown", event => {
    if (!boardController.isEnabled() || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
    if (event.key === "Escape") {
      boardController.cancelConnection();
      boardConnectionLayer.select(null);
    } else if (event.key === "Delete" && boardConnectionLayer.selectedId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void boardConnectionLayer.deleteSelected();
    }
  }, { capture: true });

  Hooks.on(`${MODULE_ID}.connectionMode`, cardId => {
    boardConnectionLayer.setActivePin(cardId);
    if (cardId) boardConnectionLayer.startPreview(cardId);
    else boardConnectionLayer.cancelPinDrag({ cancelConnection: false });
  });

  Hooks.on(`${MODULE_ID}.assetsChanged`, () => {
    clearOptimizedTextureCache();
    for (const drawing of canvas?.drawings?.placeables || []) drawing.refreshMitCard?.();
    boardConnectionLayer.invalidateTextures();
    notifyGraphAssetsChanged();
  });

  Hooks.on("renderSceneControls", controls => {
    if (controls.control?.name === "drawings") return;
    boardController.cancelConnection();
    boardConnectionLayer.select(null);
  });
}
