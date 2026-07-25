import { MODULE_ID, STRING_COLORS } from "../constants.js";
import { applicationClasses } from "../compatibility/foundry-version.js";
import { boardController } from "./board-controller.js";
import { changedFields } from "../utils/concurrency.js";

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();

export class BoardConnectionSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  #connection;
  #scene;

  constructor(connection, scene = canvas.scene, options = {}) {
    super(options);
    this.#connection = structuredClone(connection);
    this.#scene = scene;
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-connection-sheet`,
    tag: "form",
    classes: [MODULE_ID, "mit-form"],
    window: { title: `${MODULE_ID}.ConnectionEditor.Title`, icon: "fa-solid fa-link" },
    position: { width: 420, height: "auto" },
    form: { closeOnSubmit: true, handler: BoardConnectionSheet.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/board/connection-sheet.hbs` } };

  async _prepareContext() {
    return {
      connection: this.#connection,
      colors: Object.entries(STRING_COLORS).map(([name, value]) => ({
        value,
        label: game.i18n.localize(`${MODULE_ID}.ConnectionColors.${name}`),
        selected: value === this.#connection.style.color
      }))
    };
  }

  static async #submit(_event, form, formData) {
    const instance = this;
    const candidate = {
      color: formData.object.color,
      width: Number(formData.object.width),
      sag: Number(formData.object.sag)
    };
    const update = changedFields(instance.#connection.style, candidate, ["color", "width", "sag"]);
    if (!Object.keys(update.changes).length) return;
    await boardController.updateConnection(instance.#connection.id, update.changes, instance.#scene, {
      expectedStyle: update.expected
    });
  }
}
