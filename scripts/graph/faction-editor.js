import { DEFAULT_FACTION_STYLE, MODULE_ID } from "../constants.js";
import { applicationClasses } from "../compatibility/foundry-version.js";

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();

export class FactionEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  #faction;
  #callback;

  constructor(faction = {}, callback, options = {}) {
    super(options);
    this.#faction = {
      shape: "rounded-rectangle",
      width: 500,
      height: 350,
      style: DEFAULT_FACTION_STYLE,
      ...faction,
      style: { ...DEFAULT_FACTION_STYLE, ...faction.style }
    };
    this.#callback = callback;
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-faction-editor`,
    tag: "form",
    classes: [MODULE_ID, "mit-form"],
    window: { title: `${MODULE_ID}.FactionEditor.Title`, icon: "fa-solid fa-shield-halved" },
    position: { width: 500, height: "auto" },
    form: { closeOnSubmit: true, handler: FactionEditor.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/graph/faction-editor.hbs` } };

  async _prepareContext() {
    return {
      faction: this.#faction,
      members: Array.isArray(this.#faction.memberOptions) ? this.#faction.memberOptions : [],
      rounded: this.#faction.shape === "rounded-rectangle",
      ellipse: this.#faction.shape === "ellipse",
      polygon: this.#faction.shape === "polygon"
    };
  }

  static async #submit(_event, form, formData) {
    const instance = this;
    const data = formData.object;
    const faction = {
      ...instance.#faction,
      name: String(data.name || ""),
      description: String(data.description || ""),
      shape: data.shape,
      width: Number(data.width),
      height: Number(data.height),
      style: {
        fill: data.fill,
        fillOpacity: Number(data.fillOpacity),
        stroke: data.stroke,
        strokeWidth: Number(data.strokeWidth)
      },
      memberNodeIds: [...form.querySelectorAll('[name="memberNodeIds"]:checked')].map(input => input.value)
    };
    await instance.#callback(faction);
  }
}
