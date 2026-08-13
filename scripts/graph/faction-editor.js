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
    classes: [MODULE_ID, "mit-form", "mit-faction-form"],
    window: { title: `${MODULE_ID}.FactionEditor.Title`, icon: "fa-solid fa-shield-halved" },
    position: { width: 720, height: "auto" },
    form: { closeOnSubmit: true, handler: FactionEditor.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/graph/faction-editor.hbs` } };

  async _prepareContext() {
    return {
      faction: this.#faction,
      rounded: this.#faction.shape === "rounded-rectangle",
      ellipse: this.#faction.shape === "ellipse",
      polygon: this.#faction.shape === "polygon"
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const preview = this.element.querySelector("[data-faction-preview]");
    if (!preview) return;
    const synchronizePreview = () => {
      const value = name => this.element.querySelector(`[name="${name}"]`)?.value;
      const width = Math.max(100, Number(value("width")) || 500);
      const height = Math.max(80, Number(value("height")) || 350);
      const ratio = Math.min(2.5, Math.max(0.5, width / height));
      const previewWidth = ratio >= 1 ? 200 : 100 * ratio;
      const previewHeight = ratio >= 1 ? 200 / ratio : 100;
      const x = 120 - previewWidth / 2;
      const y = 70 - previewHeight / 2;
      const shapeName = value("shape") || "rounded-rectangle";
      for (const shape of preview.querySelectorAll("[data-preview-shape]")) {
        shape.toggleAttribute("hidden", shape.dataset.previewShape !== shapeName);
        shape.setAttribute("fill", value("fill") || DEFAULT_FACTION_STYLE.fill);
        shape.setAttribute("fill-opacity", value("fillOpacity") || DEFAULT_FACTION_STYLE.fillOpacity);
        shape.setAttribute("stroke", value("stroke") || DEFAULT_FACTION_STYLE.stroke);
        shape.setAttribute("stroke-width", Math.max(1, Number(value("strokeWidth")) || DEFAULT_FACTION_STYLE.strokeWidth));
      }
      const rectangle = preview.querySelector('[data-preview-shape="rounded-rectangle"]');
      rectangle?.setAttribute("x", x);
      rectangle?.setAttribute("y", y);
      rectangle?.setAttribute("width", previewWidth);
      rectangle?.setAttribute("height", previewHeight);
      rectangle?.setAttribute("rx", Math.min(18, previewHeight / 4));
      const ellipse = preview.querySelector('[data-preview-shape="ellipse"]');
      ellipse?.setAttribute("cx", 120);
      ellipse?.setAttribute("cy", 70);
      ellipse?.setAttribute("rx", previewWidth / 2);
      ellipse?.setAttribute("ry", previewHeight / 2);
      const polygon = preview.querySelector('[data-preview-shape="polygon"]');
      polygon?.setAttribute("points", [
        [x + previewWidth * 0.2, y], [x + previewWidth * 0.8, y],
        [x + previewWidth, y + previewHeight * 0.25], [x + previewWidth, y + previewHeight * 0.75],
        [x + previewWidth * 0.8, y + previewHeight], [x + previewWidth * 0.2, y + previewHeight],
        [x, y + previewHeight * 0.75], [x, y + previewHeight * 0.25]
      ].map(point => point.join(",")).join(" "));
      const name = preview.querySelector("[data-preview-name]");
      if (name) {
        name.textContent = String(value("name") || "").trim();
        name.setAttribute("x", x + 14);
        name.setAttribute("y", y + 28);
      }
      const opacity = this.element.querySelector("[data-opacity-output]");
      if (opacity) opacity.textContent = `${Math.round((Number(value("fillOpacity")) || 0) * 100)} %`;
    };
    for (const input of this.element.querySelectorAll("input, select")) {
      input.addEventListener("input", synchronizePreview);
      input.addEventListener("change", synchronizePreview);
    }
    synchronizePreview();
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
      }
    };
    await instance.#callback(faction);
  }
}
