import { MODULE_ID } from "../constants.js";

export function generation() {
  return Number(globalThis.game?.release?.generation || globalThis.game?.version?.split?.(".")?.[0] || 13);
}

export function applicationClasses() {
  const api = globalThis.foundry?.applications?.api;
  if (!api?.ApplicationV2 || !api?.HandlebarsApplicationMixin) {
    throw new Error(`${MODULE_ID}: ApplicationV2 is unavailable`);
  }
  const registeredFilePicker = globalThis.foundry?.applications?.apps?.FilePicker;
  return {
    ApplicationV2: api.ApplicationV2,
    HandlebarsApplicationMixin: api.HandlebarsApplicationMixin,
    DialogV2: api.DialogV2,
    // In Foundry v13, FilePicker is an application registration and the
    // constructable/static API is exposed by its implementation property.
    FilePicker: registeredFilePicker?.implementation || registeredFilePicker || globalThis.FilePicker
  };
}

export function addSceneTool(controls, controlName, tool) {
  const control = controls?.[controlName];
  if (!control) return false;
  control.tools ||= {};
  tool.order ??= Object.keys(control.tools).length;
  control.tools[tool.name] = tool;
  return true;
}

export function drawingDimensions(document) {
  const width = Number(document?.shape?.width ?? document?.width ?? 0);
  const height = Number(document?.shape?.height ?? document?.height ?? 0);
  return { width, height };
}

export function drawingElevation(document) {
  return Number(document?.elevation ?? document?.z ?? 0);
}

export function drawingUpdateSize(width, height) {
  return { "shape.width": width, "shape.height": height };
}

export function drawingData({ x, y, width, height, flags, hidden = false, z = 0 }) {
  const rectangle = globalThis.CONST?.DRAWING_TYPES?.RECTANGLE ?? "r";
  const solid = globalThis.CONST?.DRAWING_FILL_TYPES?.SOLID ?? 1;
  return {
    x,
    y,
    elevation: z,
    sort: z,
    hidden,
    interface: true,
    // Foundry v13 rejects a Drawing with no visible fill, stroke, or text.
    // A near-transparent fill keeps the document valid while the custom PIXI
    // card remains the only perceptible surface.
    fillType: solid,
    fillColor: "#000000",
    fillAlpha: 0.001,
    strokeAlpha: 0,
    strokeWidth: 0,
    shape: { type: rectangle, width, height },
    flags: { [MODULE_ID]: flags }
  };
}

export function drawingLayerContainer(layer = globalThis.canvas?.drawings) {
  return layer?.objects || layer;
}

export function drawingWorldBounds(document) {
  const { width, height } = drawingDimensions(document);
  return { x: Number(document?.x || 0), y: Number(document?.y || 0), width, height };
}

export function worldPositionFromCanvasDrop(data, event = null) {
  if (Number.isFinite(data?.x) && Number.isFinite(data?.y)) return { x: data.x, y: data.y };
  if (event && globalThis.canvas?.stage?.toLocal && globalThis.PIXI?.Point) {
    const rect = globalThis.canvas.app.view.getBoundingClientRect();
    return globalThis.canvas.stage.toLocal(new globalThis.PIXI.Point(event.clientX - rect.left, event.clientY - rect.top));
  }
  const scene = globalThis.canvas?.scene;
  return { x: Number(scene?.width || 1000) / 2, y: Number(scene?.height || 1000) / 2 };
}

export async function confirmDialog({ title, content, yes, no }) {
  const { DialogV2 } = applicationClasses();
  return DialogV2.confirm({
    window: { title },
    content,
    rejectClose: false,
    modal: true,
    yes: { label: yes },
    no: { label: no }
  });
}

export async function inputDialog({ title, content, ok }) {
  const { DialogV2 } = applicationClasses();
  return DialogV2.input({
    window: { title },
    content,
    rejectClose: false,
    modal: true,
    ok: { label: ok }
  });
}

export function openFilePicker({ current = "", callback, type = "image" } = {}) {
  const { FilePicker } = applicationClasses();
  if (!FilePicker) throw new Error(`${MODULE_ID}: FilePicker is unavailable`);
  const picker = new FilePicker({ current, type, callback });
  picker.render({ force: true });
  return picker;
}

export async function ensureDataDirectory(path) {
  const { FilePicker } = applicationClasses();
  if (!FilePicker?.browse || !FilePicker?.createDirectory) {
    throw new Error(`${MODULE_ID}: FilePicker directory API is unavailable`);
  }
  const normalized = String(path || "").replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  if (!normalized) return "";
  let current = "";
  for (const segment of normalized.split("/").filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await FilePicker.browse("data", current);
    } catch (_browseError) {
      try {
        await FilePicker.createDirectory("data", current);
      } catch (_createError) {
        // A second client may have created it between browse and create.
        await FilePicker.browse("data", current);
      }
    }
  }
  return normalized;
}

export function rerenderSceneControls() {
  globalThis.ui?.controls?.render?.({ force: true, reset: true });
}
