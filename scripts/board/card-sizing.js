import { DEFAULT_CARD_SIZE } from "../constants.js";

const MINIMUM_IMAGE_RATIO = 0.05;
const MAXIMUM_IMAGE_RATIO = 20;

export function normalizeImageAspectRatio(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return Math.min(MAXIMUM_IMAGE_RATIO, Math.max(MINIMUM_IMAGE_RATIO, ratio));
}

/** Preserve an image ratio using the requested card width. If the resulting
 * height is below Foundry's minimum card size, enlarge both dimensions. */
export function sizeForImageAspectRatio(value, {
  width = DEFAULT_CARD_SIZE.width,
  minimum = 120
} = {}) {
  const ratio = normalizeImageAspectRatio(value);
  if (!ratio) return null;
  const safeMinimum = Math.max(1, Number(minimum) || 1);
  let nextWidth = Math.max(safeMinimum, Number(width) || DEFAULT_CARD_SIZE.width);
  let nextHeight = nextWidth / ratio;
  if (nextHeight < safeMinimum) {
    nextHeight = safeMinimum;
    nextWidth = nextHeight * ratio;
  }
  return {
    width: Math.round(nextWidth * 100) / 100,
    height: Math.round(nextHeight * 100) / 100
  };
}

export function naturalImageAspectRatio(image) {
  const width = Number(image?.naturalWidth || image?.videoWidth || 0);
  const height = Number(image?.naturalHeight || image?.videoHeight || 0);
  return normalizeImageAspectRatio(width / height);
}

/** Resolve dimensions through the already rendered preview when possible,
 * otherwise use the browser's normal image loader for the selected path. */
export async function loadImageAspectRatio(path, { preview = null, timeout = 5_000 } = {}) {
  if (!path) return null;
  const previewPath = preview?.getAttribute?.("src") || "";
  if (previewPath === path) {
    const previewRatio = naturalImageAspectRatio(preview);
    if (previewRatio) return previewRatio;
  }
  const ImageClass = globalThis.Image;
  if (typeof ImageClass !== "function") return null;
  return new Promise(resolve => {
    let settled = false;
    let timer = null;
    const image = new ImageClass();
    const finish = value => {
      if (settled) return;
      settled = true;
      if (timer !== null) globalThis.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    image.onload = () => finish(naturalImageAspectRatio(image));
    image.onerror = () => finish(null);
    timer = globalThis.setTimeout(() => finish(null), timeout);
    image.src = path;
    if (image.complete && naturalImageAspectRatio(image)) finish(naturalImageAspectRatio(image));
  });
}
