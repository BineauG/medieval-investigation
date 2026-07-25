import { MODULE_ID } from "../constants.js";
import { applicationClasses, openFilePicker } from "../compatibility/foundry-version.js";

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();

export class CustomNodeEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  #node;
  #callback;

  constructor(node = {}, callback, options = {}) {
    super(options);
    this.#node = {
      name: String(node.name || ""),
      image: String(node.image || "")
    };
    this.#callback = callback;
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-custom-node-editor`,
    tag: "form",
    classes: [MODULE_ID, "mit-form"],
    window: { title: `${MODULE_ID}.CustomNodeEditor.Title`, icon: "fa-solid fa-circle-nodes" },
    position: { width: 480, height: "auto" },
    form: { closeOnSubmit: true, handler: CustomNodeEditor.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/graph/custom-node-editor.hbs` } };

  async _prepareContext() {
    return { node: this.#node };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-image-picker]")?.addEventListener("click", event => {
      event.preventDefault();
      const input = this.element.querySelector("[name='image']");
      openFilePicker({
        current: input?.value || "",
        callback: path => {
          if (input) input.value = path;
          const preview = this.element.querySelector("[data-node-image-preview]");
          if (preview) {
            preview.src = path;
            preview.hidden = !path;
          }
        }
      });
    });
  }

  static async #submit(_event, _form, formData) {
    const instance = this;
    await instance.#callback({
      name: String(formData.object.name || "").trim().slice(0, 500),
      image: String(formData.object.image || "").trim().slice(0, 2_000)
    });
  }
}
