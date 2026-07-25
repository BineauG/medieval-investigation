import { DEFAULT_EDGE_STYLE, MODULE_ID, RELATION_PRESETS } from "../constants.js";
import { applicationClasses, confirmDialog } from "../compatibility/foundry-version.js";

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();
const NEW_LABEL_VALUE = "__new_relation_label__";
const normalizedLabel = value => String(value || "").trim().normalize("NFKC").toLocaleLowerCase();

export function relationPresetOptions(
  localize,
  currentLabel = "",
  currentColor = DEFAULT_EDGE_STYLE.color,
  customLabels = [],
  disabledPresetKeys = []
) {
  const disabled = new Set(disabledPresetKeys);
  const normalizedCurrent = normalizedLabel(currentLabel);
  const options = RELATION_PRESETS
    .filter(preset => !disabled.has(preset.key))
    .map(preset => ({
      value: `preset:${preset.key}`,
      key: preset.key,
      label: localize(`${MODULE_ID}.Relations.${preset.key}`),
      color: preset.color,
      deletable: true,
      selected: false
    }));

  for (const custom of Array.isArray(customLabels) ? customLabels : []) {
    if (!custom?.id || !String(custom.label || "").trim()) continue;
    options.push({
      value: `custom:${custom.id}`,
      id: custom.id,
      label: String(custom.label).trim(),
      color: custom.color || DEFAULT_EDGE_STYLE.color,
      deletable: true,
      selected: false
    });
  }

  let selected = options.find(option => normalizedLabel(option.label) === normalizedCurrent);
  if (!selected && currentLabel) {
    selected = {
      value: "legacy:current",
      label: String(currentLabel).trim(),
      color: currentColor,
      deletable: true,
      selected: true
    };
    options.push(selected);
  }
  if (selected) selected.selected = true;

  return options.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
}

export class RelationEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  #edge;
  #saveCallback;
  #deleteLabelCallback;
  #relationLabels;
  #disabledPresetKeys;
  #options = [];

  constructor(edge = {}, callbacks, options = {}) {
    super(options);
    const {
      relationLabels = [],
      disabledRelationPresetKeys = [],
      ...edgeData
    } = edge;
    this.#edge = {
      directed: true,
      mutual: false,
      labelPosition: 0.5,
      ...edgeData,
      style: { ...DEFAULT_EDGE_STYLE, ...edgeData.style }
    };
    this.#relationLabels = relationLabels;
    this.#disabledPresetKeys = disabledRelationPresetKeys;
    this.#saveCallback = typeof callbacks === "function" ? callbacks : callbacks?.save;
    this.#deleteLabelCallback = typeof callbacks === "object" ? callbacks?.deleteLabel : null;
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-relation-editor`,
    tag: "form",
    classes: [MODULE_ID, "mit-form"],
    window: { title: `${MODULE_ID}.RelationEditor.Title`, icon: "fa-solid fa-arrow-right-arrow-left" },
    position: { width: 520, height: "auto" },
    form: { closeOnSubmit: true, handler: RelationEditor.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/graph/relation-editor.hbs` } };

  async _prepareContext() {
    this.#options = relationPresetOptions(
      key => game.i18n.localize(key),
      this.#edge.label,
      this.#edge.style.color,
      this.#relationLabels,
      this.#disabledPresetKeys
    );
    if (!this.#edge.label && this.#options.length) {
      this.#options[0].selected = true;
      this.#edge.label = this.#options[0].label;
      this.#edge.style.color = this.#options[0].color;
    }
    return {
      edge: this.#edge,
      presets: this.#options,
      newLabelValue: NEW_LABEL_VALUE,
      newSelected: this.#options.length === 0,
      solid: this.#edge.style.lineStyle === "solid",
      dashed: this.#edge.style.lineStyle === "dashed",
      dotted: this.#edge.style.lineStyle === "dotted"
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const relation = this.element.querySelector("[name='labelChoice']");
    const color = this.element.querySelector("[name='color']");
    const newFields = this.element.querySelector("[data-new-label-fields]");
    const newInput = this.element.querySelector("[name='newLabel']");
    const deleteButton = this.element.querySelector("[data-action='delete-label']");

    const synchronizeChoice = ({ applyColor = false } = {}) => {
      const isNew = relation?.value === NEW_LABEL_VALUE;
      if (newFields) newFields.hidden = !isNew;
      if (newInput) newInput.required = isNew;
      const option = relation?.selectedOptions?.[0];
      if (deleteButton) deleteButton.disabled = isNew || option?.dataset?.deletable !== "true" || !this.#deleteLabelCallback;
      if (applyColor && color && !isNew && option?.dataset?.color) color.value = option.dataset.color;
      if (isNew) newInput?.focus();
    };

    relation?.addEventListener("change", () => synchronizeChoice({ applyColor: true }));
    deleteButton?.addEventListener("click", async event => {
      event.preventDefault();
      const option = relation?.selectedOptions?.[0];
      if (!option || option.dataset.deletable !== "true" || !this.#deleteLabelCallback) return;
      const confirmed = await confirmDialog({
        title: game.i18n.localize(`${MODULE_ID}.Confirm.DeleteRelationLabelTitle`),
        content: `<p>${game.i18n.localize(`${MODULE_ID}.Confirm.DeleteRelationLabel`)}</p>`,
        yes: game.i18n.localize(`${MODULE_ID}.Actions.Delete`),
        no: game.i18n.localize(`${MODULE_ID}.Actions.Cancel`)
      });
      if (!confirmed) return;
      await this.#deleteLabelCallback({
        id: option.dataset.id || "",
        key: option.dataset.key || "",
        label: option.dataset.label || option.textContent || ""
      });
      await this.close();
    });
    synchronizeChoice();
  }

  static async #submit(_event, _form, formData) {
    const instance = this;
    const data = formData.object;
    const selected = instance.#options.find(option => option.value === data.labelChoice);
    const requestedNewLabel = data.labelChoice === NEW_LABEL_VALUE ? String(data.newLabel || "").trim().slice(0, 500) : "";
    const existing = requestedNewLabel
      ? instance.#options.find(option => normalizedLabel(option.label) === normalizedLabel(requestedNewLabel))
      : null;
    const label = requestedNewLabel ? existing?.label || requestedNewLabel : selected?.label || instance.#edge.label;
    const selectedColor = existing?.color || data.color;
    await instance.#saveCallback?.({
      ...instance.#edge,
      label,
      newRelationLabel: requestedNewLabel && !existing ? { label: requestedNewLabel, color: data.color } : null,
      directed: true,
      mutual: data.mutual === true || data.mutual === "true" || data.mutual === "on",
      labelPosition: Number(data.labelPosition),
      style: { color: selectedColor, width: Number(data.width), lineStyle: data.lineStyle }
    });
  }
}
