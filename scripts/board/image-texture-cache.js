export const MAX_CARD_TEXTURE_DIMENSION = 1536;
export const MAX_CARD_TEXTURE_PIXELS = 1536 * 1536;
export const MAX_DECORATION_TEXTURE_DIMENSION = 512;
export const MAX_DECORATION_TEXTURE_PIXELS = 512 * 512;

const textureCache = new Map();
let cacheGeneration = 0;

export function boundedTextureSize(width, height, {
  maxDimension = MAX_CARD_TEXTURE_DIMENSION,
  maxPixels = MAX_CARD_TEXTURE_PIXELS
} = {}) {
  const sourceWidth = Math.max(1, Number(width) || 1);
  const sourceHeight = Math.max(1, Number(height) || 1);
  const dimensionScale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const pixelScale = Math.min(1, Math.sqrt(maxPixels / (sourceWidth * sourceHeight)));
  const scale = Math.min(dimensionScale, pixelScale);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    scaled: scale < 0.9999
  };
}

function loadBrowserImage(path, timeout = 15_000) {
  const ImageClass = globalThis.Image;
  if (typeof ImageClass !== "function") return Promise.resolve(null);
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
    image.decoding = "async";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    timer = globalThis.setTimeout(() => finish(null), timeout);
    image.src = path;
    if (image.complete && Number(image.naturalWidth) > 0) finish(image);
  });
}

async function createOptimizedTexture(path, limits) {
  const PIXI = globalThis.PIXI;
  if (!PIXI) return { texture: null, owned: false };
  const image = await loadBrowserImage(path);
  const document = globalThis.document;
  if (image && document?.createElement && PIXI.Texture?.from) {
    try {
      const bounded = boundedTextureSize(image.naturalWidth, image.naturalHeight, limits);
      let source = image;
      if (bounded.scaled) {
        const canvas = document.createElement("canvas");
        canvas.width = bounded.width;
        canvas.height = bounded.height;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("Canvas 2D is unavailable");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, bounded.width, bounded.height);
        source = canvas;
      }
      return { texture: PIXI.Texture.from(source), owned: true };
    } catch (_error) {
      // Cross-origin images can make a resize canvas unusable. Let Foundry's
      // normal asset pipeline load those files without optimization.
    }
  }
  try {
    return { texture: await PIXI.Assets.load(path), owned: false };
  } catch (_error) {
    return { texture: null, owned: false };
  }
}

/** Load one shared board texture. Large raster files are downsampled before
 * PIXI uploads them to the GPU; repeated cards reuse the resulting texture. */
export function loadOptimizedTexture(path, limits = {}) {
  if (!path) return Promise.resolve(null);
  const normalizedLimits = {
    maxDimension: Math.max(64, Number(limits.maxDimension || MAX_CARD_TEXTURE_DIMENSION)),
    maxPixels: Math.max(4096, Number(limits.maxPixels || MAX_CARD_TEXTURE_PIXELS))
  };
  const key = `${path}::${normalizedLimits.maxDimension}::${normalizedLimits.maxPixels}`;
  const cached = textureCache.get(key);
  if (cached) return cached.promise;

  const generation = cacheGeneration;
  const entry = { promise: null, texture: null, owned: false };
  entry.promise = createOptimizedTexture(path, normalizedLimits).then(result => {
    entry.texture = result.texture;
    entry.owned = result.owned;
    if (generation !== cacheGeneration && entry.owned) entry.texture?.destroy?.(true);
    return generation === cacheGeneration ? entry.texture : null;
  }).catch(() => {
    textureCache.delete(key);
    return null;
  });
  textureCache.set(key, entry);
  return entry.promise;
}

export function clearOptimizedTextureCache() {
  cacheGeneration += 1;
  for (const entry of textureCache.values()) {
    if (entry.owned && entry.texture) entry.texture.destroy?.(true);
  }
  textureCache.clear();
}
