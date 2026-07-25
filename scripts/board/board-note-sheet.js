import { MODULE_ID } from "../constants.js";
import { applicationClasses } from "../compatibility/foundry-version.js";
import { boardController } from "./board-controller.js";
import { normalizeNoteText } from "./note-data.js";
import { createCardData } from "./board-data.js";
import { changedFields } from "../utils/concurrency.js";

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();

export class BoardNoteSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  #drawing;
  #initial;

  constructor({ drawing } = {}, options = {}) {
    super({ ...options, id: options.id || `${MODULE_ID}-note-sheet-${drawing?.id || "new"}` });
    this.#drawing = drawing;
    this.#initial = createCardData(drawing?.flags?.[MODULE_ID] || {});
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-note-sheet`,
    tag: "form",
    classes: [MODULE_ID, "mit-form", "mit-note-sheet"],
    window: { title: `${MODULE_ID}.NoteEditor.Title`, icon: "fa-solid fa-bookmark" },
    position: { width: 360, height: "auto" },
    form: { closeOnSubmit: true, handler: BoardNoteSheet.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/board/note-sheet.hbs` } };

  async _prepareContext() {
    const card = this.#initial;
    return {
      noteText: normalizeNoteText(card.titleOverride || card.text)
        || game.i18n.localize(`${MODULE_ID}.Labels.NoteDefault`)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element.querySelector("[name='noteText']");
    input?.focus();
    input?.select();
    input?.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (typeof this.element.requestSubmit === "function") this.element.requestSubmit();
      else this.element.querySelector("button[type='submit']")?.click();
    });
  }

  static async #submit(_event, _form, formData) {
    const instance = this;
    if (!instance.#drawing) throw new Error("Errors.CardMissing");
    const noteText = normalizeNoteText(formData.object.noteText)
      || game.i18n.localize(`${MODULE_ID}.Labels.NoteDefault`);
    const tags = [];
    if (!game.user.isGM) {
      const update = changedFields(instance.#initial, { titleOverride: noteText, tags }, ["titleOverride", "tags"]);
      if (!Object.keys(update.changes).length) return;
      await boardController.updateCard(instance.#drawing.id, update.changes, instance.#drawing.parent, {
        expected: update.expected
      });
      return;
    }
    await boardController.updateCard(instance.#drawing.id, {
      titleOverride: noteText,
      tags,
      text: "",
      imageOverride: "",
      sourceUuid: null,
      sourceType: null,
      showName: true,
      showImage: false
    }, instance.#drawing.parent);
  }
}

export function openBoardNoteSheet({ drawing } = {}) {
  let app;
  try {
    app = new BoardNoteSheet({ drawing });
    const rendered = app.render({ force: true });
    if (rendered?.catch) rendered.catch(error => boardController.notifyError(error));
  } catch (error) {
    boardController.notifyError(error);
  }
  return app || null;
}
