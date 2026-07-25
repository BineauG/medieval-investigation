function modernGraphics(graphics) {
  return typeof graphics?.fill === "function" && typeof graphics?.stroke === "function";
}

function legacyColor(value) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^#[0-9a-f]{6}$/iu.test(normalized)) return Number.parseInt(normalized.slice(1), 16);
    if (/^0x[0-9a-f]+$/iu.test(normalized)) return Number.parseInt(normalized.slice(2), 16);
  }
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function legacyLineStyle(graphics, style = null) {
  if (!style) return graphics.lineStyle(0, 0, 0);
  return graphics.lineStyle(
    Number(style.width ?? 1),
    legacyColor(style.color),
    Number(style.alpha ?? 1)
  );
}

export function createText(PIXI, value, style) {
  const major = Number.parseInt(String(PIXI?.VERSION || "7").split(".")[0], 10);
  return major >= 8
    ? new PIXI.Text({ text: value, style })
    : new PIXI.Text(value, style);
}

export function drawRoundedRect(graphics, x, y, width, height, radius, fill, stroke = null) {
  if (modernGraphics(graphics) && typeof graphics.roundRect === "function") {
    graphics.roundRect(x, y, width, height, radius).fill(fill);
    if (stroke) graphics.stroke(stroke);
    return graphics;
  }

  legacyLineStyle(graphics, stroke);
  graphics.beginFill(Number(fill?.color ?? 0), Number(fill?.alpha ?? 1));
  graphics.drawRoundedRect(x, y, width, height, radius);
  graphics.endFill();
  return graphics;
}

export function drawCircle(graphics, x, y, radius, fill = null, stroke = null) {
  if (modernGraphics(graphics) && typeof graphics.circle === "function") {
    graphics.circle(x, y, radius);
    if (fill) graphics.fill(fill);
    if (stroke) graphics.stroke(stroke);
    return graphics;
  }

  legacyLineStyle(graphics, stroke);
  if (fill) graphics.beginFill(Number(fill.color ?? 0), Number(fill.alpha ?? 1));
  graphics.drawCircle(x, y, radius);
  if (fill) graphics.endFill();
  return graphics;
}

export function strokePath(graphics, style, draw) {
  if (modernGraphics(graphics)) {
    draw(graphics);
    graphics.stroke(style);
    return graphics;
  }

  legacyLineStyle(graphics, style);
  draw(graphics);
  return graphics;
}
