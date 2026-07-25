import {
  DEFAULT_EDGE_STYLE,
  DEFAULT_DEATH_OVERLAY_OPACITY,
  DEFAULT_FACTION_STYLE,
  DEFEATED_OVERLAY_IMAGE,
  MODULE_ID,
  NOTE_ASSET_DIRECTORY,
  PARCHMENT_ASSET_DIRECTORY,
  PIN_ASSET_DIRECTORY,
  STRING_COLORS
} from "./constants.js";
import { applicationClasses, ensureDataDirectory, openFilePicker } from "./compatibility/foundry-version.js";

const key = name => `${MODULE_ID}.Settings.${name}`;

function register(name, data) {
  game.settings.register(MODULE_ID, name, { scope: "world", config: true, ...data });
}

export function registerSettings() {
  register("cardScale", { name: key("CardScale.Name"), hint: key("CardScale.Hint"), type: Number, default: 1, range: { min: 0.5, max: 2, step: 0.05 } });
  register("stringColor", {
    name: key("StringColor.Name"),
    hint: key("StringColor.Hint"),
    type: String,
    default: STRING_COLORS.Red,
    choices: Object.fromEntries(Object.entries(STRING_COLORS).map(([name, value]) => [
      value,
      `${MODULE_ID}.ConnectionColors.${name}`
    ]))
  });
  register("stringWidth", { name: key("StringWidth.Name"), hint: key("StringWidth.Hint"), type: Number, default: 4, range: { min: 1, max: 12, step: 1 } });
  register("minimumCardSize", { name: key("MinimumCardSize.Name"), hint: key("MinimumCardSize.Hint"), type: Number, default: 120, range: { min: 80, max: 300, step: 10 } });
  register("noteTextDirection", {
    name: key("NoteTextDirection.Name"),
    hint: key("NoteTextDirection.Hint"),
    type: String,
    default: "right",
    choices: { right: key("NoteTextDirection.Right"), left: key("NoteTextDirection.Left") },
    onChange: () => Hooks.callAll(`${MODULE_ID}.assetsChanged`)
  });
  register("confirmDelete", { name: key("ConfirmDelete.Name"), hint: key("ConfirmDelete.Hint"), type: Boolean, default: true });
  register("nodeSize", { name: key("NodeSize.Name"), hint: key("NodeSize.Hint"), type: Number, default: 112, range: { min: 64, max: 220, step: 4 } });
  register("factionFill", { name: key("FactionFill.Name"), hint: key("FactionFill.Hint"), type: String, default: DEFAULT_FACTION_STYLE.fill });
  register("factionOpacity", { name: key("FactionOpacity.Name"), hint: key("FactionOpacity.Hint"), type: Number, default: DEFAULT_FACTION_STYLE.fillOpacity, range: { min: 0, max: 0.8, step: 0.02 } });
  register("edgeColor", { name: key("EdgeColor.Name"), hint: key("EdgeColor.Hint"), type: String, default: DEFAULT_EDGE_STYLE.color });
  register("edgeWidth", { name: key("EdgeWidth.Name"), hint: key("EdgeWidth.Hint"), type: Number, default: DEFAULT_EDGE_STYLE.width, range: { min: 1, max: 10, step: 1 } });
  register("anonymizeUnauthorized", { name: key("AnonymizeUnauthorized.Name"), hint: key("AnonymizeUnauthorized.Hint"), type: Boolean, default: true });
  register("debugLogging", { name: key("DebugLogging.Name"), hint: key("DebugLogging.Hint"), type: Boolean, default: false });

  for (const [name, defaultValue] of [
    ["parchmentTexture", ""],
    ["noteBannerImage", ""],
    ["waxSealImage", ""],
    ["unknownActorImage", `modules/${MODULE_ID}/assets/unknown-person.svg`]
  ]) {
    game.settings.register(MODULE_ID, name, { scope: "world", config: false, type: String, default: defaultValue });
  }
  game.settings.register(MODULE_ID, "deathOverlayOpacity", {
    scope: "world",
    config: false,
    type: Number,
    default: DEFAULT_DEATH_OVERLAY_OPACITY,
    range: { min: 0, max: 1, step: 0.05 }
  });

  game.settings.registerMenu(MODULE_ID, "assetSettings", {
    name: key("Assets.Name"),
    label: key("Assets.Label"),
    hint: key("Assets.Hint"),
    icon: "fa-solid fa-images",
    type: AssetSettingsApp,
    restricted: true
  });
}

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();

export class AssetSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-asset-settings`,
    tag: "form",
    classes: [MODULE_ID, "mit-form"],
    window: { title: `${MODULE_ID}.Settings.Assets.Name`, icon: "fa-solid fa-images" },
    position: { width: 760, height: "auto" },
    form: { closeOnSubmit: true, handler: AssetSettingsApp.#submit }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/settings-assets.hbs` } };

  async _prepareContext() {
    const deathOverlayOpacity = Math.min(1, Math.max(0, Number(
      game.settings.get(MODULE_ID, "deathOverlayOpacity") ?? DEFAULT_DEATH_OVERLAY_OPACITY
    )));
    return {
      parchmentTexture: game.settings.get(MODULE_ID, "parchmentTexture"),
      noteBannerImage: game.settings.get(MODULE_ID, "noteBannerImage"),
      waxSealImage: game.settings.get(MODULE_ID, "waxSealImage"),
      unknownActorImage: game.settings.get(MODULE_ID, "unknownActorImage"),
      deathOverlayImage: DEFEATED_OVERLAY_IMAGE,
      deathOverlayOpacity,
      deathOverlayOpacityPercent: Math.round(deathOverlayOpacity * 100),
      parchmentDirectory: PARCHMENT_ASSET_DIRECTORY,
      noteDirectory: NOTE_ASSET_DIRECTORY,
      pinDirectory: PIN_ASSET_DIRECTORY
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    for (const button of this.element.querySelectorAll("[data-file-picker]")) {
      button.addEventListener("click", event => {
        event.preventDefault();
        const input = this.element.querySelector(`[name="${button.dataset.filePicker}"]`);
        openFilePicker({
          current: input?.value || button.dataset.directory || "",
          callback: path => {
            if (input) input.value = path;
            this.#updatePreview(button.dataset.filePicker, path);
          }
        });
      });
    }
    for (const input of this.element.querySelectorAll("[data-asset-path]")) {
      input.addEventListener("change", () => this.#updatePreview(input.name, input.value));
    }
    for (const preview of this.element.querySelectorAll("[data-asset-preview]")) {
      preview.addEventListener("error", () => { preview.hidden = true; });
    }
    const opacity = this.element.querySelector("[name='deathOverlayOpacity']");
    const output = this.element.querySelector("[data-death-opacity-output]");
    opacity?.addEventListener("input", () => {
      if (output) output.textContent = `${Math.round(Number(opacity.value) * 100)} %`;
    });
  }

  #updatePreview(name, path) {
    const preview = this.element.querySelector(`[data-asset-preview="${name}"]`);
    if (!preview) return;
    preview.hidden = !path;
    if (path) preview.src = path;
  }

  static async #submit(_event, _form, formData) {
    const data = formData.object;
    const deathOverlayOpacity = Math.min(1, Math.max(0, Number(
      data.deathOverlayOpacity ?? DEFAULT_DEATH_OVERLAY_OPACITY
    )));
    await Promise.all([
      ...["parchmentTexture", "noteBannerImage", "waxSealImage", "unknownActorImage"].map(name => (
        game.settings.set(MODULE_ID, name, String(data[name] || ""))
      )),
      game.settings.set(MODULE_ID, "deathOverlayOpacity", deathOverlayOpacity)
    ]);
    Hooks.callAll(`${MODULE_ID}.assetsChanged`);
  }
}

export async function ensureCustomAssetDirectories() {
  if (!game.user?.isGM) return [];
  const created = [];
  for (const directory of [PIN_ASSET_DIRECTORY, PARCHMENT_ASSET_DIRECTORY, NOTE_ASSET_DIRECTORY]) {
    created.push(await ensureDataDirectory(directory));
  }
  return created;
}

export function getSetting(name) {
  return game.settings.get(MODULE_ID, name);
}
