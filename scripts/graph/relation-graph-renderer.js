import { DEFAULT_DEATH_OVERLAY_OPACITY, DEFEATED_OVERLAY_IMAGE, MODULE_ID } from "../constants.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(key, String(value));
  }
  return element;
}

function deathOverlayOpacity() {
  const configured = Number(globalThis.game?.settings?.get?.(MODULE_ID, "deathOverlayOpacity"));
  return Number.isFinite(configured)
    ? Math.min(1, Math.max(0, configured))
    : DEFAULT_DEATH_OVERLAY_OPACITY;
}

function renderBounds(entity) {
  return {
    x: Number(entity.x || 0),
    y: Number(entity.y || 0),
    width: Math.max(1, Number(entity.width || 1)),
    height: Math.max(1, Number(entity.height || 1))
  };
}

export function entityCenter(entity) {
  const bounds = renderBounds(entity);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function boundaryPoint(entity, toward) {
  const bounds = renderBounds(entity);
  const origin = entityCenter(entity);
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  if (!dx && !dy) return origin;
  if (entity.kind === "faction" && entity.shape === "ellipse") {
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    const scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return { x: origin.x + dx * scale, y: origin.y + dy * scale };
  }
  if (entity.kind === "faction" && entity.shape === "polygon") {
    const intersection = polygonBoundaryPoint(entity, origin, toward);
    if (intersection) return intersection;
  }
  const scale = 1 / Math.max(Math.abs(dx) / (bounds.width / 2), Math.abs(dy) / (bounds.height / 2));
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
}

function vector(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length, length };
}

function canonicalLaneVector(source, target, laneOffset) {
  if (!laneOffset) return { x: 0, y: 0 };
  const sourceCenter = entityCenter(source);
  const targetCenter = entityCenter(target);
  const sourceFirst = String(source.id || "") <= String(target.id || "");
  const canonicalStart = sourceFirst ? sourceCenter : targetCenter;
  const canonicalEnd = sourceFirst ? targetCenter : sourceCenter;
  const direction = vector(canonicalStart, canonicalEnd);
  return { x: -direction.y * laneOffset, y: direction.x * laneOffset };
}

function cubicPoint(segment, t) {
  const [p0, p1, p2, p3] = segment;
  const inverse = 1 - t;
  const inverse2 = inverse * inverse;
  const t2 = t * t;
  return {
    x: inverse2 * inverse * p0.x + 3 * inverse2 * t * p1.x + 3 * inverse * t2 * p2.x + t2 * t * p3.x,
    y: inverse2 * inverse * p0.y + 3 * inverse2 * t * p1.y + 3 * inverse * t2 * p2.y + t2 * t * p3.y,
    dx: 3 * inverse2 * (p1.x - p0.x) + 6 * inverse * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
    dy: 3 * inverse2 * (p1.y - p0.y) + 6 * inverse * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y)
  };
}

export function pointOnEdgeCurve(curve, position = 0.5) {
  const segments = curve.segments || [];
  if (!segments.length) return { x: curve.a.x, y: curve.a.y, dx: curve.b.x - curve.a.x, dy: curve.b.y - curve.a.y };
  const normalized = Math.min(1, Math.max(0, Number(position) || 0));
  if (normalized === 1) return cubicPoint(segments.at(-1), 1);
  const scaled = normalized * segments.length;
  const index = Math.floor(scaled);
  return cubicPoint(segments[index], scaled - index);
}

export function edgeLabelPoint(curve, position) {
  const point = pointOnEdgeCurve(curve, position);
  const tangentLength = Math.hypot(point.dx, point.dy) || 1;
  const normal = { x: -point.dy / tangentLength, y: point.dx / tangentLength };
  const distance = curve.laneSide ? curve.laneSide * 10 : -10;
  return { x: point.x + normal.x * distance, y: point.y + normal.y * distance };
}

function curvePath(segments) {
  const [first, ...rest] = segments;
  let d = `M ${first[0].x} ${first[0].y} C ${first[1].x} ${first[1].y}, ${first[2].x} ${first[2].y}, ${first[3].x} ${first[3].y}`;
  for (const segment of rest) d += ` C ${segment[1].x} ${segment[1].y}, ${segment[2].x} ${segment[2].y}, ${segment[3].x} ${segment[3].y}`;
  return d;
}

function polygonVertices(faction) {
  if (faction.points?.length >= 3) return faction.points.map(point => ({ x: faction.x + point.x, y: faction.y + point.y }));
  const x = faction.x;
  const y = faction.y;
  const w = faction.width;
  const h = faction.height;
  return [
    [x + w * 0.2, y], [x + w * 0.8, y], [x + w, y + h * 0.25], [x + w, y + h * 0.75],
    [x + w * 0.8, y + h], [x + w * 0.2, y + h], [x, y + h * 0.75], [x, y + h * 0.25]
  ].map(([pointX, pointY]) => ({ x: pointX, y: pointY }));
}

function polygonPoints(faction) {
  return polygonVertices(faction).map(point => `${point.x},${point.y}`).join(" ");
}

function polygonBoundaryPoint(faction, origin, toward) {
  const direction = { x: toward.x - origin.x, y: toward.y - origin.y };
  const cross = (left, right) => left.x * right.y - left.y * right.x;
  let nearest = null;
  const vertices = polygonVertices(faction);
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const segment = { x: end.x - start.x, y: end.y - start.y };
    const denominator = cross(direction, segment);
    if (Math.abs(denominator) < 1e-9) continue;
    const offset = { x: start.x - origin.x, y: start.y - origin.y };
    const distance = cross(offset, segment) / denominator;
    const position = cross(offset, direction) / denominator;
    if (distance < 0 || position < 0 || position > 1 || (nearest && distance >= nearest.distance)) continue;
    nearest = {
      distance,
      point: { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance }
    };
  }
  return nearest?.point || null;
}

function pointInPolygon(point, vertices) {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const current = vertices[index];
    const before = vertices[previous];
    const crosses = (current.y > point.y) !== (before.y > point.y)
      && point.x < ((before.x - current.x) * (point.y - current.y)) / (before.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function entityContainsPoint(entity, point) {
  const bounds = renderBounds(entity);
  if (point.x < bounds.x || point.x > bounds.x + bounds.width || point.y < bounds.y || point.y > bounds.y + bounds.height) return false;
  if (entity.kind !== "faction" || entity.shape === "rounded-rectangle") return true;
  if (entity.shape === "ellipse") {
    const center = entityCenter(entity);
    const x = (point.x - center.x) / (bounds.width / 2);
    const y = (point.y - center.y) / (bounds.height / 2);
    return x * x + y * y <= 1;
  }
  if (entity.shape === "polygon") return pointInPolygon(point, polygonVertices(entity));
  return true;
}

export function edgeCurve(source, target, laneOffset = 0) {
  const sourceCenter = entityCenter(source);
  const targetCenter = entityCenter(target);
  const lane = canonicalLaneVector(source, target, laneOffset);
  const midpoint = {
    x: (sourceCenter.x + targetCenter.x) / 2 + lane.x,
    y: (sourceCenter.y + targetCenter.y) / 2 + lane.y
  };
  const a = boundaryPoint(source, midpoint);
  const b = boundaryPoint(target, midpoint);
  const forward = vector(sourceCenter, targetCenter);
  const startDirection = vector(sourceCenter, midpoint);
  const endDirection = vector(b, targetCenter);
  const handle = Math.min(180, Math.max(24, forward.length * 0.24));
  const midpointHandle = Math.min(90, handle * 0.55);
  const first = [
    a,
    { x: a.x + startDirection.x * handle, y: a.y + startDirection.y * handle },
    { x: midpoint.x - forward.x * midpointHandle, y: midpoint.y - forward.y * midpointHandle },
    midpoint
  ];
  const second = [
    midpoint,
    { x: midpoint.x + forward.x * midpointHandle, y: midpoint.y + forward.y * midpointHandle },
    { x: b.x - endDirection.x * handle, y: b.y - endDirection.y * handle },
    b
  ];
  const actualNormal = { x: -forward.y, y: forward.x };
  const actualLane = lane.x * actualNormal.x + lane.y * actualNormal.y;
  const segments = [first, second];
  return { a, b, d: curvePath(segments), segments, laneSide: Math.sign(actualLane) };
}

function edgeCurveToPoint(source, targetPoint) {
  const a = boundaryPoint(source, targetPoint);
  const direction = vector(a, targetPoint);
  const handle = Math.min(150, Math.max(20, direction.length * 0.35));
  const segment = [
    a,
    { x: a.x + direction.x * handle, y: a.y + direction.y * handle },
    { x: targetPoint.x - direction.x * handle, y: targetPoint.y - direction.y * handle },
    targetPoint
  ];
  const segments = [segment];
  return { a, b: targetPoint, d: curvePath(segments), segments, laneSide: 0 };
}

export function allocateEdgeLanes(edges = [], gap = 22) {
  const groups = new Map();
  for (const edge of edges) {
    const pair = [String(edge.sourceId), String(edge.targetId)].sort().join("\u0000");
    if (!groups.has(pair)) groups.set(pair, []);
    groups.get(pair).push(edge);
  }
  const lanes = new Map();
  for (const group of groups.values()) {
    group.sort((left, right) => (
      String(left.sourceId).localeCompare(String(right.sourceId))
      || String(left.targetId).localeCompare(String(right.targetId))
      || String(left.id).localeCompare(String(right.id))
    ));
    group.forEach((edge, index) => lanes.set(edge.id, (index - (group.length - 1) / 2) * gap));
  }
  return lanes;
}

export class RelationGraphRenderer {
  #app;
  #svg;
  #viewport;
  #factionsLayer;
  #edgesLayer;
  #nodesLayer;
  #entityElements = new Map();
  #edgeElements = new Map();
  #edgeLanes = new Map();
  #listeners = [];
  #dragCleanup = null;
  #previewedEntityIds = new Set();

  constructor(app, svg) {
    this.#app = app;
    this.#svg = svg;
    this.#viewport = svg.querySelector("[data-graph-viewport]");
    this.#factionsLayer = svg.querySelector("[data-graph-factions]");
    this.#edgesLayer = svg.querySelector("[data-graph-edges]");
    this.#nodesLayer = svg.querySelector("[data-graph-nodes]");
    this.#listen(svg, "wheel", event => this.#onWheel(event), { passive: false });
    this.#listen(svg, "pointerdown", event => this.#onBackgroundPointerDown(event));
    this.#listen(svg, "dragover", event => event.preventDefault());
    this.#listen(svg, "drop", event => this.#app.handleDrop(event));
  }

  #listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.#listeners.push([target, type, listener, options]);
  }

  render() {
    this.#previewedEntityIds.clear();
    this.#entityElements.clear();
    this.#edgeElements.clear();
    this.#factionsLayer.replaceChildren();
    this.#edgesLayer.replaceChildren();
    this.#nodesLayer.replaceChildren();
    this.#edgeLanes = allocateEdgeLanes(this.#app.graph.edges);
    this.updateViewport();
    [...this.#app.graph.factions].sort((left, right) => left.z - right.z).forEach(faction => this.#renderFaction(faction));
    this.#app.graph.edges.forEach(edge => this.#renderEdge(edge));
    this.#app.graph.nodes.forEach(node => this.#renderNode(node));
  }

  updateViewport() {
    const { x, y, zoom } = this.#app.graph.viewport;
    this.#viewport.setAttribute("transform", `translate(${x} ${y}) scale(${zoom})`);
  }

  #renderFaction(faction) {
    const group = svgElement("g", { class: `mit-graph-faction${this.#app.selected?.id === faction.id ? " is-selected" : ""}`, "data-entity-id": faction.id, tabindex: 0, role: "button", "aria-label": faction.name });
    let shape;
    if (faction.shape === "ellipse") {
      shape = svgElement("ellipse", { cx: faction.x + faction.width / 2, cy: faction.y + faction.height / 2, rx: faction.width / 2, ry: faction.height / 2 });
    } else if (faction.shape === "polygon") {
      shape = svgElement("polygon", { points: polygonPoints(faction) });
    } else {
      shape = svgElement("rect", { x: faction.x, y: faction.y, width: faction.width, height: faction.height, rx: 24, ry: 24 });
    }
    shape.setAttribute("fill", faction.style.fill);
    shape.setAttribute("fill-opacity", faction.style.fillOpacity);
    shape.setAttribute("stroke", faction.style.stroke);
    shape.setAttribute("stroke-width", faction.style.strokeWidth);
    group.appendChild(shape);
    const label = svgElement("text", { x: faction.x + 16, y: faction.y + 28, class: "mit-faction-label" });
    label.textContent = faction.name;
    group.appendChild(label);
    if (this.#app.selected?.id === faction.id && this.#app.canMoveEntity(faction)) {
      const handle = svgElement("rect", { x: faction.x + faction.width - 10, y: faction.y + faction.height - 10, width: 20, height: 20, rx: 3, class: "mit-resize-handle", "aria-label": game.i18n.localize(`${MODULE_ID}.Graph.ResizeFaction`) });
      handle.addEventListener("pointerdown", event => this.#beginResize(event, faction));
      group.appendChild(handle);
    }
    this.#bindEntity(group, faction);
    this.#factionsLayer.appendChild(group);
    this.#entityElements.set(faction.id, group);
  }

  #renderNode(node) {
    const presentation = this.#app.nodePresentation(node.id);
    const group = svgElement("g", {
      class: `mit-graph-node${this.#app.selected?.id === node.id ? " is-selected" : ""}${presentation.missing ? " is-missing" : ""}${node.hideAppearance && !node.hideName ? " is-appearance-hidden" : ""}`,
      transform: `translate(${node.x} ${node.y})`,
      "data-entity-id": node.id,
      tabindex: 0,
      role: "button",
      "aria-label": presentation.name
    });
    const title = svgElement("title");
    title.textContent = presentation.name;
    const hit = svgElement("rect", { x: 0, y: 0, width: node.width, height: node.height, class: "mit-node-hit" });
    const image = svgElement("image", { x: 0, y: 0, width: node.width, height: node.height, href: presentation.image, preserveAspectRatio: "xMidYMid meet", class: "mit-node-image" });
    const name = svgElement("text", { x: node.width / 2, y: node.height + 21, class: "mit-node-name", "text-anchor": "middle" });
    name.textContent = presentation.name;
    group.append(title, hit, image);
    if (node.dead) {
      group.appendChild(svgElement("image", {
        x: 0,
        y: 0,
        width: node.width,
        height: node.height,
        href: DEFEATED_OVERLAY_IMAGE,
        preserveAspectRatio: "xMidYMid meet",
        opacity: deathOverlayOpacity(),
        class: "mit-node-dead-overlay",
        "aria-hidden": "true"
      }));
    }
    group.appendChild(name);
    this.#bindEntity(group, node);
    this.#nodesLayer.appendChild(group);
    this.#entityElements.set(node.id, group);
  }

  #renderEdge(edge) {
    const source = this.#app.entity(edge.sourceId);
    const target = this.#app.entity(edge.targetId);
    if (!source || !target) return;
    const curve = edgeCurve(source, target, this.#edgeLanes.get(edge.id) || 0);
    const group = svgElement("g", { class: `mit-graph-edge${this.#app.selected?.id === edge.id ? " is-selected" : ""}`, "data-edge-id": edge.id, role: "button", tabindex: 0, "aria-label": edge.label || game.i18n.localize(`${MODULE_ID}.Graph.UnlabelledRelation`) });
    const hit = svgElement("path", { d: curve.d, class: "mit-edge-hit" });
    const line = svgElement("path", {
      d: curve.d,
      fill: "none",
      stroke: edge.style.color,
      "stroke-width": edge.style.width,
      "stroke-dasharray": edge.style.lineStyle === "dashed" ? "10 7" : edge.style.lineStyle === "dotted" ? "2 7" : "",
      "marker-start": edge.mutual ? "url(#mit-arrowhead)" : "",
      "marker-end": "url(#mit-arrowhead)"
    });
    group.append(hit, line);
    const labelPoint = edgeLabelPoint(curve, edge.labelPosition);
    const label = svgElement("text", { x: labelPoint.x, y: labelPoint.y, class: "mit-edge-label", "text-anchor": "middle" });
    label.textContent = edge.label;
    group.appendChild(label);
    group.addEventListener("pointerdown", event => {
      event.stopPropagation();
      this.#app.select({ kind: "edge", id: edge.id });
    });
    group.addEventListener("dblclick", event => {
      event.stopPropagation();
      this.#app.editEdge(edge.id);
    });
    group.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      this.#app.openEdgeMenu(edge.id, event.clientX, event.clientY);
    });
    this.#edgesLayer.appendChild(group);
    this.#edgeElements.set(edge.id, group);
  }

  #bindEntity(element, entity) {
    element.addEventListener("pointerdown", event => {
      event.stopPropagation();
      if (this.#app.canManageEdges && event.button === 0 && event.shiftKey) {
        return this.#beginRelationDrag(event, entity);
      }
      this.#app.select({ kind: entity.kind, id: entity.id });
      if (this.#app.canMoveEntity(entity) && event.button === 0) this.#beginDrag(event, entity);
    });
    element.addEventListener("dblclick", event => {
      event.stopPropagation();
      this.#app.openEntity(entity.id);
    });
    element.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      this.#app.openEntityMenu(entity.id, event.clientX, event.clientY);
    });
  }

  #beginRelationDrag(event, source) {
    event.preventDefault();
    this.#endDrag();
    const pointerId = event.pointerId;
    const preview = svgElement("path", {
      class: "mit-edge-preview",
      fill: "none",
      "marker-end": "url(#mit-arrowhead)"
    });
    this.#edgesLayer.appendChild(preview);
    let targetId = null;
    const setTarget = nextId => {
      if (targetId === nextId) return;
      if (targetId) this.#entityElements.get(targetId)?.classList.remove("is-relation-target");
      targetId = nextId;
      if (targetId) this.#entityElements.get(targetId)?.classList.add("is-relation-target");
    };
    const move = pointer => {
      if (pointer.pointerId !== pointerId) return;
      const target = this.#entityAt(pointer.clientX, pointer.clientY, source.id);
      setTarget(target?.id || null);
      const curve = target
        ? edgeCurve(source, target)
        : edgeCurveToPoint(source, this.clientToGraph(pointer.clientX, pointer.clientY));
      preview.setAttribute("d", curve.d);
    };
    const up = pointer => {
      if (pointer.pointerId !== pointerId) return;
      const completedTargetId = this.#entityAt(pointer.clientX, pointer.clientY, source.id)?.id || null;
      this.#endDrag();
      if (completedTargetId) this.#app.createRelation(source.id, completedTargetId);
    };
    const cancel = pointer => {
      if (pointer.pointerId === pointerId) this.#endDrag();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    this.#dragCleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (targetId) this.#entityElements.get(targetId)?.classList.remove("is-relation-target");
      preview.remove();
    };
    move(event);
  }

  #entityAt(clientX, clientY, excludedId) {
    const point = this.clientToGraph(clientX, clientY);
    for (let index = this.#app.graph.nodes.length - 1; index >= 0; index -= 1) {
      const node = this.#app.graph.nodes[index];
      if (node.id === excludedId) continue;
      if (entityContainsPoint(node, point)) return node;
    }
    const factions = [...this.#app.graph.factions].sort((left, right) => Number(right.z || 0) - Number(left.z || 0));
    for (const faction of factions) {
      if (faction.id === excludedId) continue;
      if (entityContainsPoint(faction, point)) return faction;
    }
    return null;
  }

  #beginDrag(event, entity) {
    event.preventDefault();
    this.#endDrag();
    const start = this.clientToGraph(event.clientX, event.clientY);
    const baselines = new Map([[entity.id, { x: entity.x, y: entity.y }]]);
    if (entity.kind === "faction" && !event.altKey) {
      for (const nodeId of entity.memberNodeIds) {
        const node = this.#app.entity(nodeId);
        if (node) baselines.set(nodeId, { x: node.x, y: node.y });
      }
    }
    this.#app.beginInteractiveChange();
    const move = pointer => {
      const current = this.clientToGraph(pointer.clientX, pointer.clientY);
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      for (const [id, baseline] of baselines) {
        const item = this.#app.entity(id);
        if (!item) continue;
        item.x = baseline.x + dx;
        item.y = baseline.y + dy;
        this.updateEntityAndEdges(id);
      }
      this.#app.previewInteractiveChange();
    };
    const up = () => {
      this.#endDrag();
      void this.#app.commitInteractiveChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    this.#dragCleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }

  #beginResize(event, faction) {
    event.stopPropagation();
    event.preventDefault();
    this.#endDrag();
    const start = this.clientToGraph(event.clientX, event.clientY);
    const initial = { width: faction.width, height: faction.height };
    this.#app.beginInteractiveChange();
    const move = pointer => {
      const current = this.clientToGraph(pointer.clientX, pointer.clientY);
      faction.width = Math.max(100, initial.width + current.x - start.x);
      faction.height = Math.max(80, initial.height + current.y - start.y);
      this.updateEntityAndEdges(faction.id, true);
      this.#app.previewInteractiveChange();
    };
    const up = () => {
      this.#endDrag();
      void this.#app.commitInteractiveChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    this.#dragCleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }

  #endDrag() {
    this.#dragCleanup?.();
    this.#dragCleanup = null;
  }

  cancelInteraction() {
    this.#endDrag();
    this.#app.cancelInteractiveChange();
  }

  applyEntityPreviews(positions = []) {
    const previews = new Map();
    for (const position of positions) {
      const item = this.#app.entity(position.entityId);
      if (!item) continue;
      previews.set(position.entityId, position);
    }
    for (const id of this.#previewedEntityIds) {
      if (!previews.has(id)) this.updateEntityAndEdges(id, this.#app.entity(id)?.kind === "faction");
    }
    const originals = new Map();
    for (const [id, preview] of previews) {
      const item = this.#app.entity(id);
      if (!item) continue;
      originals.set(id, { x: item.x, y: item.y, width: item.width, height: item.height });
      item.x = preview.x;
      item.y = preview.y;
      if (Number.isFinite(preview.width)) item.width = preview.width;
      if (Number.isFinite(preview.height)) item.height = preview.height;
    }
    for (const id of previews.keys()) this.updateEntityAndEdges(id, this.#app.entity(id)?.kind === "faction");
    for (const [id, original] of originals) Object.assign(this.#app.entity(id), original);
    this.#previewedEntityIds = new Set(previews.keys());
  }

  updateEntityAndEdges(entityId, rerenderEntity = false) {
    const entity = this.#app.entity(entityId);
    const element = this.#entityElements.get(entityId);
    if (entity?.kind === "actor" && element) element.setAttribute("transform", `translate(${entity.x} ${entity.y})`);
    else if (entity?.kind === "faction" && element) {
      const shape = element.querySelector("rect:not(.mit-resize-handle), ellipse, polygon");
      if (shape?.tagName === "rect") {
        shape.setAttribute("x", entity.x);
        shape.setAttribute("y", entity.y);
        shape.setAttribute("width", entity.width);
        shape.setAttribute("height", entity.height);
      } else if (shape?.tagName === "ellipse") {
        shape.setAttribute("cx", entity.x + entity.width / 2);
        shape.setAttribute("cy", entity.y + entity.height / 2);
        shape.setAttribute("rx", entity.width / 2);
        shape.setAttribute("ry", entity.height / 2);
      } else if (shape?.tagName === "polygon") shape.setAttribute("points", polygonPoints(entity));
      const label = element.querySelector(".mit-faction-label");
      label?.setAttribute("x", entity.x + 16);
      label?.setAttribute("y", entity.y + 28);
      const handle = element.querySelector(".mit-resize-handle");
      if (handle) {
        handle.setAttribute("x", entity.x + entity.width - 10);
        handle.setAttribute("y", entity.y + entity.height - 10);
      }
    }
    for (const edge of this.#app.graph.edges) {
      if (edge.sourceId === entityId || edge.targetId === entityId) this.#updateEdge(edge);
    }
  }

  #updateEdge(edge) {
    const group = this.#edgeElements.get(edge.id);
    const source = this.#app.entity(edge.sourceId);
    const target = this.#app.entity(edge.targetId);
    if (!group || !source || !target) return;
    const curve = edgeCurve(source, target, this.#edgeLanes.get(edge.id) || 0);
    for (const path of group.querySelectorAll("path")) path.setAttribute("d", curve.d);
    const label = group.querySelector("text");
    if (label) {
      const labelPoint = edgeLabelPoint(curve, edge.labelPosition);
      label.setAttribute("x", labelPoint.x);
      label.setAttribute("y", labelPoint.y);
    }
  }

  #onBackgroundPointerDown(event) {
    if (event.target.closest?.("[data-entity-id], [data-edge-id]")) return;
    this.#app.select(null);
    if (event.button !== 0 && event.button !== 1) return;
    const viewport = this.#app.graph.viewport;
    const start = { x: event.clientX, y: event.clientY, vx: viewport.x, vy: viewport.y };
    const move = pointer => {
      viewport.x = start.vx + pointer.clientX - start.x;
      viewport.y = start.vy + pointer.clientY - start.y;
      this.updateViewport();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      this.#app.graphChanged({ viewportOnly: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  #onWheel(event) {
    event.preventDefault();
    const rect = this.#svg.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const viewport = this.#app.graph.viewport;
    const graphPoint = { x: (pointer.x - viewport.x) / viewport.zoom, y: (pointer.y - viewport.y) / viewport.zoom };
    const zoom = Math.min(4, Math.max(0.15, viewport.zoom * (event.deltaY < 0 ? 1.12 : 0.89)));
    viewport.x = pointer.x - graphPoint.x * zoom;
    viewport.y = pointer.y - graphPoint.y * zoom;
    viewport.zoom = zoom;
    this.updateViewport();
    this.#app.graphChanged({ viewportOnly: true });
  }

  clientToGraph(clientX, clientY) {
    const rect = this.#svg.getBoundingClientRect();
    const viewport = this.#app.graph.viewport;
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom
    };
  }

  fit() {
    const entities = [...this.#app.graph.factions, ...this.#app.graph.nodes];
    if (!entities.length) return;
    const minX = Math.min(...entities.map(entity => entity.x));
    const minY = Math.min(...entities.map(entity => entity.y));
    const maxX = Math.max(...entities.map(entity => entity.x + entity.width));
    const maxY = Math.max(...entities.map(entity => entity.y + entity.height));
    const rect = this.#svg.getBoundingClientRect();
    const zoom = Math.min(2, Math.max(0.15, Math.min(rect.width / Math.max(1, maxX - minX), rect.height / Math.max(1, maxY - minY)) * 0.86));
    this.#app.graph.viewport.zoom = zoom;
    this.#app.graph.viewport.x = (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom;
    this.#app.graph.viewport.y = (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom;
    this.updateViewport();
    this.#app.graphChanged({ viewportOnly: true });
  }

  destroy() {
    this.#endDrag();
    for (const [target, type, listener, options] of this.#listeners) target.removeEventListener(type, listener, options);
    this.#listeners = [];
    this.#entityElements.clear();
    this.#edgeElements.clear();
  }
}
