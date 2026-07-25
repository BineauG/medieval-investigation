import { MODULE_ID } from "../constants.js";
import { applicationClasses } from "../compatibility/foundry-version.js";

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();

export class NodeEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  #node;
  #callback;
  #sourceName;
  #custom;

  constructor(node = {}, callback, options = {}) {
    super(options);
    this.#custom = Boolean(node.custom || !node.actorUuid);
    this.#sourceName = String(node.sourceName || node.cachedName || "");
    this.#node = {
      hideName: false,
      hideAppearance: false,
      dead: false,
      ...node,
      custom: this.#custom,
      displayName: String(node.nameOverride || this.#sourceName)
    };
    this.#callback = callback;
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-node-editor`,
    tag: "form",
    classes: [MODULE_ID, "mit-form"],
    window: { title: `${MODULE_ID}.NodeEditor.Title`, icon: "fa-solid fa-user-secret" },
    position: { width: 390, height: "auto" },
    form: { closeOnSubmit: true, handler: NodeEditor.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/graph/node-editor.hbs` } };

  async _prepareContext() {
    return { node: this.#node };
  }

  static async #submit(_event, _form, formData) {
    const instance = this;
    const data = formData.object;
    const displayName = String(data.displayName || "").trim().slice(0, 500);
    await instance.#callback({
      nameOverride: instance.#custom || displayName !== instance.#sourceName ? displayName : "",
      hideName: data.hideName === true || data.hideName === "true" || data.hideName === "on",
      hideAppearance: data.hideAppearance === true || data.hideAppearance === "true" || data.hideAppearance === "on",
      dead: data.dead === true || data.dead === "true" || data.dead === "on"
    });
  }
}
