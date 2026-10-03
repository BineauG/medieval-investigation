import { DEFAULT_WAX_SEAL_SCALE } from "../constants.js";

export function boardPinSize(cardWidth, scale = DEFAULT_WAX_SEAL_SCALE) {
  const width = Number(cardWidth);
  const requestedScale = Number(scale);
  const safeWidth = Number.isFinite(width) ? width : 0;
  const safeScale = Number.isFinite(requestedScale)
    ? Math.min(2, Math.max(0.5, requestedScale))
    : DEFAULT_WAX_SEAL_SCALE;
  return Math.max(28, Math.min(52, safeWidth * 0.17)) * safeScale;
}
