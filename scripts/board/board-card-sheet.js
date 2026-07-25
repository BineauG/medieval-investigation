import { CUSTOM_ASSET_ROOT, MODULE_ID, PARCHMENT_ASSET_DIRECTORY } from "../constants.js";
import { applicationClasses, openFilePicker } from "../compatibility/foundry-version.js";
import { createCardData } from "./board-data.js";
import { boardController } from "./board-controller.js";
import { loadImageAspectRatio } from "./card-sizing.js";
import { canViewDocument, documentImage, resolveUuid } from "../utils/documents.js";
import { changedFields } from "../utils/concurrency.js";

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();

export class BoardCardSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  #drawing;
  #initial;
  #position;
  #imageSelectionChanged = false;

  constructor({ drawing = null, initial = {}, position = {} } = {}, options = {}) {
    const suffix = drawing?.id || `${initial.cardType || "free"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    super({ ...options, id: options.id || `${MODULE_ID}-card-sheet-${suffix}` });
    this.#drawing = drawing;
    this.#initial = createCardData(drawing?.flags?.[MODULE_ID] || initial, { userId: game.user.id });
    this.#position = position;
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-card-sheet`,
    tag: "form",
    classes: [MODULE_ID, "mit-form", "mit-card-sheet"],
    window: { title: `${MODULE_ID}.CardEditor.Title`, icon: "fa-solid fa-scroll", resizable: true },
    position: { width: 520, height: "auto" },
    form: { closeOnSubmit: true, handler: BoardCardSheet.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/board/card-sheet.hbs` } };

  async _prepareContext() {
    const isGM = Boolean(game.user.isGM);
    if (!isGM) {
      return {
        card: this.#initial,
        editing: Boolean(this.#drawing),
        isGM,
        isActor: this.#initial.cardType === "actor",
        isDead: this.#initial.tags.includes("dead")
      };
    }
    const source = await resolveUuid(this.#initial.sourceUuid);
    const actors = game.actors?.contents || Array.from(game.actors || []);
    const genericParchment = `modules/${MODULE_ID}/assets/parchment.svg`;
    return {
      card: this.#initial,
      editing: Boolean(this.#drawing),
      isGM,
      isDead: this.#initial.tags.includes("dead"),
      actors: actors
        .filter(actor => canViewDocument(actor))
        .map(actor => ({ uuid: actor.uuid, name: actor.name, selected: actor.uuid === this.#initial.sourceUuid }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      sourceName: source?.name || "",
      previewImage: this.#initial.cardType === "document"
        ? (this.#initial.imageOverride || genericParchment)
        : (this.#initial.imageOverride || documentImage(source, "")),
      sourceMissing: Boolean(this.#initial.sourceUuid && !source),
      isActor: this.#initial.cardType === "actor",
      isDocument: this.#initial.cardType === "document"
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[name='cardType']")?.addEventListener("change", event => {
      if (this.#drawing) return;
      this.#initial = createCardData({ ...this.#initial, cardType: event.currentTarget.value }, { userId: game.user.id });
      this.render({ force: true });
    });
    this.element.querySelector("[data-action='browse-image']")?.addEventListener("click", event => {
      event.preventDefault();
      const input = this.element.querySelector("[name='imageOverride']");
      const defaultDirectory = this.#initial.cardType === "document" ? PARCHMENT_ASSET_DIRECTORY : CUSTOM_ASSET_ROOT;
      openFilePicker({ current: input?.value || defaultDirectory, callback: path => {
        if (input) input.value = path;
        this.#imageSelectionChanged = true;
        const preview = this.element.querySelector("[data-card-image-preview]");
        if (preview) preview.src = path;
      } });
    });
    this.element.querySelector("[data-action='reset-title']")?.addEventListener("click", event => {
      event.preventDefault();
      const input = this.element.querySelector("[name='titleOverride']");
      if (input) input.value = "";
    });
    this.element.querySelector("[data-action='reset-image']")?.addEventListener("click", async event => {
      event.preventDefault();
      const input = this.element.querySelector("[name='imageOverride']");
      if (input) input.value = "";
      this.#imageSelectionChanged = true;
      const preview = this.element.querySelector("[data-card-image-preview]");
      if (preview) {
        if (this.#initial.cardType === "document") preview.src = `modules/${MODULE_ID}/assets/parchment.svg`;
        else preview.src = documentImage(await resolveUuid(this.#initial.sourceUuid), "");
      }
    });
    this.element.querySelector("[name='imageOverride']")?.addEventListener("change", event => {
      this.#imageSelectionChanged = true;
      const preview = this.element.querySelector("[data-card-image-preview]");
      if (!preview) return;
      preview.src = event.currentTarget.value || (this.#initial.cardType === "document"
        ? `modules/${MODULE_ID}/assets/parchment.svg`
        : preview.src);
    });
  }

  static async #submit(_event, form, formData) {
    const instance = this;
    const data = formData.object;
    const cardType = data.cardType || instance.#initial.cardType;
    const tags = cardType === "actor" && (data.dead === true || data.dead === "true" || data.dead === "on")
      ? ["dead"]
      : [];
    if (!game.user.isGM) {
      if (!instance.#drawing) throw new Error("Errors.PermissionDenied");
      const update = changedFields(instance.#initial, {
        titleOverride: data.titleOverride,
        tags
      }, ["titleOverride", "tags"]);
      if (!Object.keys(update.changes).length) return;
      await boardController.updateCard(instance.#drawing.id, update.changes, instance.#drawing.parent, {
        expected: update.expected
      });
      return;
    }
    const sourceUuid = cardType === "actor" ? (data.actorUuid || data.sourceUuid) : data.sourceUuid;
    const card = createCardData({
      ...instance.#initial,
      cardType,
      sourceUuid: sourceUuid || null,
      titleOverride: data.titleOverride,
      imageOverride: data.imageOverride,
      tags,
      showName: data.showName === true || data.showName === "true" || data.showName === "on",
      showImage: data.showImage === true || data.showImage === "true" || data.showImage === "on"
    }, { userId: game.user.id });
    const imageChanged = card.cardType === "document"
      && Boolean(card.imageOverride)
      && (!instance.#drawing || instance.#imageSelectionChanged || card.imageOverride !== instance.#initial.imageOverride);
    const imageAspectRatio = imageChanged
      ? await loadImageAspectRatio(card.imageOverride, {
        preview: instance.element.querySelector("[data-card-image-preview]")
      })
      : null;
    if (instance.#drawing) {
      await boardController.updateCard(instance.#drawing.id, { ...card, imageAspectRatio }, instance.#drawing.parent);
    } else {
      await boardController.createCard(card, { ...instance.#position, imageAspectRatio });
    }
  }
}

/** Open an editor from canvas controls or a Drawing interaction and surface any
 * render failure as a Foundry notification instead of an unhandled rejection. */
export function openBoardCardSheet(options = {}) {
  let app;
  try {
    app = new BoardCardSheet(options);
    const rendered = app.render({ force: true });
    if (rendered?.catch) rendered.catch(error => boardController.notifyError(error));
  } catch (error) {
    boardController.notifyError(error);
  }
  return app || null;
}
