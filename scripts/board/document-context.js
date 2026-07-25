import { MODULE_ID } from "../constants.js";
import { canViewDocument, isAudioReference, isVideoReference } from "../utils/documents.js";
import { boardController } from "./board-controller.js";
import { cardFromDrop } from "./card-factory.js";
import { createCardData } from "./board-data.js";
import { loadImageAspectRatio } from "./card-sizing.js";

const DIRECTORY_DOCUMENT_TYPES = ["Actor", "Item", "JournalEntry", "Scene", "RollTable", "Macro", "Cards"];

function rootElement(html) {
  return html instanceof HTMLElement ? html : html?.[0] || null;
}

function canCreateCard() {
  return Boolean(game.user?.isGM);
}

function contextIsAvailable() {
  return Boolean(canvas?.ready && canvas.scene && canCreateCard()
    && (boardController.isEnabled(canvas.scene) || game.user?.isGM));
}

function targetElement(element) {
  const raw = element instanceof HTMLElement ? element : element?.[0] || element;
  return raw?.closest?.("[data-uuid], [data-entry-id], [data-page-id], [data-macro-id], [data-document-id], [data-scene-id], [data-id]") || raw;
}

function contextDocumentId(element) {
  const data = targetElement(element)?.dataset || {};
  return data.itemId || data.documentId || data.entryId || data.pageId || data.macroId || data.sceneId || data.id || "";
}

async function documentFromContext(application, element, documentName) {
  const target = targetElement(element);
  const uuid = target?.dataset?.uuid || target?.getAttribute?.("data-uuid");
  if (uuid) {
    const document = await fromUuid(uuid);
    if (document) return document;
  }

  const id = contextDocumentId(element);
  if (!id) return null;

  const packId = target?.closest?.("[data-pack]")?.dataset?.pack
    || application?.collection?.metadata?.id
    || application?.collection?.collection;
  if (packId && game.packs?.get?.(packId)) {
    const packed = await game.packs.get(packId).getDocument(id);
    if (packed) return packed;
  }

  if (documentName === "JournalEntryPage") {
    const page = application?.entry?.pages?.get?.(id) || application?.document?.pages?.get?.(id);
    if (page) return page;
    for (const journal of game.journal || []) {
      const nested = journal.pages?.get?.(id);
      if (nested) return nested;
    }
  }

  if (application?.document?.id === id) return application.document;
  const direct = application?.collection?.get?.(id);
  if (direct?.documentName) return direct;

  if (application?.collection?.getDocument) {
    const packed = await application.collection.getDocument(id);
    if (packed) return packed;
  }

  const collectionNames = {
    Actor: "actors",
    Item: "items",
    JournalEntry: "journal",
    Scene: "scenes",
    RollTable: "tables",
    Macro: "macros",
    Cards: "cards"
  };
  const collection = game[collectionNames[documentName]];
  const worldDocument = game.collections?.get?.(documentName)?.get?.(id) || collection?.get?.(id);
  if (worldDocument) return worldDocument;

  // Last-resort compendium lookup mirrors Investigation Board's v13 resolver.
  for (const pack of game.packs?.filter?.(candidate => candidate.documentName === documentName) || []) {
    if (pack.index?.has?.(id)) return pack.getDocument(id);
  }
  return null;
}

function actorFromApplication(application) {
  const candidate = application?.actor || application?.document || application?.object;
  return candidate?.documentName === "Actor" || candidate?.items ? candidate : null;
}

function actorItemFromElement(application, element) {
  const actor = actorFromApplication(application);
  const id = contextDocumentId(element);
  return id ? actor?.items?.get?.(id) || null : null;
}

function nextCardPosition(scene = canvas?.scene) {
  const count = boardController.cards(scene).length;
  const offset = (count % 8) * 28;
  return {
    x: Number(scene?.width || 1000) / 2 + offset,
    y: Number(scene?.height || 1000) / 2 + offset
  };
}

function supportedSource(document) {
  return Boolean(document?.uuid && canViewDocument(document) && !isAudioReference(document) && !isVideoReference(document));
}

export async function addDocumentToBoard(document, { position = null } = {}) {
  const scene = canvas?.scene;
  if (!canvas?.ready || !scene) throw new Error("Errors.BoardUnavailable");
  if (!canCreateCard()) throw new Error("Errors.PermissionDenied");
  if (!supportedSource(document)) {
    if (isAudioReference(document)) throw new Error("Errors.AudioUnsupported");
    if (isVideoReference(document)) throw new Error("Errors.VideoUnsupported");
    throw new Error("Errors.PermissionDenied");
  }

  if (!boardController.isEnabled(scene)) {
    if (!game.user.isGM) throw new Error("Errors.BoardUnavailable");
    await boardController.setEnabled(scene, true);
  }

  const card = await cardFromDrop({
    uuid: document.uuid,
    type: document.documentName,
    id: document.id
  });
  const imageAspectRatio = card.imageOverride ? await loadImageAspectRatio(card.imageOverride) : null;
  const result = await boardController.createCard(card, {
    ...(position || nextCardPosition(scene)),
    imageAspectRatio
  }, scene);
  ui.notifications?.info?.(game.i18n.format(`${MODULE_ID}.Board.AddedToBoard`, { name: document.name || "" }));
  return result;
}

function imageFromContext(element) {
  const raw = element instanceof HTMLElement ? element : element?.[0] || element;
  const image = raw?.tagName === "IMG" ? raw : raw?.querySelector?.("img");
  const path = image?.getAttribute?.("src") || image?.currentSrc || image?.src || "";
  return { image, path: String(path || "").trim() };
}

function journalSourceFromContext(application, element) {
  const raw = element instanceof HTMLElement ? element : element?.[0] || element;
  const pageId = raw?.closest?.("[data-page-id]")?.dataset?.pageId || "";
  const document = application?.document || application?.object || null;
  const entry = application?.entry
    || (document?.documentName === "JournalEntry" ? document : document?.parent);
  return entry?.pages?.get?.(pageId)
    || (document?.documentName === "JournalEntryPage" ? document : null)
    || entry
    || null;
}

export async function addJournalImageToBoard(path, {
  source = null,
  title = "",
  preview = null,
  position = null
} = {}) {
  const scene = canvas?.scene;
  if (!canvas?.ready || !scene) throw new Error("Errors.BoardUnavailable");
  if (!canCreateCard()) throw new Error("Errors.PermissionDenied");
  if (!path || isAudioReference({ path }) || isVideoReference({ path })) throw new Error("Errors.InvalidCard");
  if (source && !canViewDocument(source)) throw new Error("Errors.PermissionDenied");
  if (!boardController.isEnabled(scene)) await boardController.setEnabled(scene, true);

  const card = createCardData({
    cardType: "document",
    sourceUuid: source?.uuid || null,
    sourceType: source?.documentName || null,
    titleOverride: String(title || "").trim(),
    imageOverride: path,
    showName: true,
    showImage: true
  }, { userId: game.user.id });
  const imageAspectRatio = await loadImageAspectRatio(path, { preview });
  const result = await boardController.createCard(card, {
    ...(position || nextCardPosition(scene)),
    imageAspectRatio
  }, scene);
  const name = card.titleOverride || source?.name || game.i18n.localize(`${MODULE_ID}.Labels.Untitled`);
  ui.notifications?.info?.(game.i18n.format(`${MODULE_ID}.Board.AddedToBoard`, { name }));
  return result;
}

function addContextOption(documentName, application, options) {
  options.push({
    name: `${MODULE_ID}.Actions.AddToBoard`,
    icon: '<i class="fa-solid fa-thumbtack"></i>',
    condition: () => contextIsAvailable(),
    callback: element => documentFromContext(application, element, documentName)
      .then(document => addDocumentToBoard(document))
      .catch(error => boardController.notifyError(error))
  });
}

function registerDirectoryMenus() {
  for (const documentName of DIRECTORY_DOCUMENT_TYPES) {
    Hooks.on(`get${documentName}ContextOptions`, (application, options) => {
      addContextOption(documentName, application, options);
    });
  }

  Hooks.on("getJournalEntryPageContextOptions", (application, options) => {
    addContextOption("JournalEntryPage", application, options);
  });
}

function registerTokenHudButton() {
  Hooks.on("renderTokenHUD", (hud, html) => {
    if (!contextIsAvailable() || !hud?.actor) return;
    const root = rootElement(html);
    const column = root?.querySelector(".col.right");
    if (!column || column.querySelector("[data-mit-add-to-board]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon";
    button.dataset.mitAddToBoard = "true";
    button.dataset.tooltip = game.i18n.localize(`${MODULE_ID}.Actions.AddToBoard`);
    button.setAttribute("aria-label", button.dataset.tooltip);
    button.innerHTML = '<i class="fa-solid fa-thumbtack" inert></i>';
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      addDocumentToBoard(hud.actor).catch(error => boardController.notifyError(error));
    });
    column.prepend(button);
  });
}

function addMenuItem(menu, marker, item) {
  if (!Array.isArray(menu?.menuItems) || menu.menuItems.some(option => option?.[marker])) return;
  menu.menuItems.push({ ...item, [marker]: true });
}

function registerActorInventoryMenus() {
  const attach = application => {
    if (!game.user?.isGM) return;
    globalThis.setTimeout(() => {
      for (const menu of application?.contextMenus || []) {
        addMenuItem(menu, "mitAddInventoryItemToBoard", {
          name: `${MODULE_ID}.Actions.AddToBoard`,
          icon: '<i class="fa-solid fa-thumbtack"></i>',
          condition: element => contextIsAvailable() && Boolean(actorItemFromElement(application, element)),
          callback: element => {
            const item = actorItemFromElement(application, element);
            if (!item) return ui.notifications?.warn?.(game.i18n.localize(`${MODULE_ID}.Errors.InvalidUuid`));
            return addDocumentToBoard(item).catch(error => boardController.notifyError(error));
          }
        });
      }
    }, 50);
  };
  for (const hook of [
    "renderActorSheet",
    "renderActorSheetV2",
    "renderActorSheetWFRP4eCharacter",
    "renderActorSheetWFRP4eNPC",
    "renderActorSheetWFRP4eCreature",
    "renderActorSheetWFRP4eVehicle"
  ]) Hooks.on(hook, attach);
}

function registerJournalImageMenus() {
  const attach = application => {
    if (!game.user?.isGM) return;
    globalThis.setTimeout(() => {
      const menus = [...(application?.contextMenus || [])];
      const imageMenus = menus.filter(menu => menu.menuItems?.some(item => (
        item?.name === "Show to Players" || item?.name === "OWNERSHIP.ShowAll"
      )));
      for (const menu of imageMenus.length ? imageMenus : menus) {
        addMenuItem(menu, "mitAddJournalImageToBoard", {
          name: `${MODULE_ID}.Actions.AddToBoard`,
          icon: '<i class="fa-solid fa-file-image"></i>',
          condition: element => contextIsAvailable() && Boolean(imageFromContext(element).path),
          callback: element => {
            const { image, path } = imageFromContext(element);
            const source = journalSourceFromContext(application, element);
            const title = image?.getAttribute?.("alt") || source?.name || "";
            return addJournalImageToBoard(path, { source, title, preview: image })
              .catch(error => boardController.notifyError(error));
          }
        });
      }
    }, 100);
  };
  for (const hook of [
    "renderJournalSheet",
    "renderJournalPageSheet",
    "renderJournalEntrySheet",
    "renderJournalEntryPageSheet"
  ]) Hooks.on(hook, attach);
}

export function registerDocumentContextMenus() {
  registerDirectoryMenus();
  registerTokenHudButton();
  registerActorInventoryMenus();
  registerJournalImageMenus();
}
