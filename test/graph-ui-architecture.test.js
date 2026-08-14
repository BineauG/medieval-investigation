import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  allocateEdgeLanes,
  edgeCurve,
  edgeLabelPoint,
  entityContainsPoint,
  pointOnEdgeCurve
} from "../scripts/graph/relation-graph-renderer.js";
import { RELATION_PRESETS } from "../scripts/constants.js";

test("graph changes use immediate collaborative mutations while Save flushes the queue", () => {
  const app = fs.readFileSync(new URL("../scripts/graph/relation-graph-app.js", import.meta.url), "utf8");
  const store = fs.readFileSync(new URL("../scripts/graph/relation-graph-store.js", import.meta.url), "utf8");
  const sockets = fs.readFileSync(new URL("../scripts/board/board-sockets.js", import.meta.url), "utf8");
  const settings = fs.readFileSync(new URL("../scripts/settings.js", import.meta.url), "utf8");

  assert.match(app, /#commitMutation\(mutation/u);
  assert.match(app, /await relationGraphStore\.mutate\(this\.page, mutation\)/u);
  assert.match(store, /socketService\.request\("graph\.mutate"/u);
  assert.match(sockets, /"graph\.mutate"/u);
  assert.match(sockets, /onEvent\(eventName, handler\)/u);
  assert.match(sockets, /publish\(eventName, payload\)/u);
  assert.match(app, /socketService\.onEvent\("graph\.drag-preview"/u);
  assert.match(app, /now - this\.#lastDragBroadcast < 50/u);
  assert.doesNotMatch(store, /expectedRevision|graph\.save/u);
  assert.match(app, /async _onClose\(options\)[\s\S]*await this\.save\(\)/u);
  assert.match(app, /if \(action === "save"\) return this\.save\(\)/u);
  assert.doesNotMatch(settings, /register\("autoSaveGraph"|register\("saveDebounce"/u);
});

test("relations are created by Shift-dragging between characters and factions", () => {
  const renderer = fs.readFileSync(new URL("../scripts/graph/relation-graph-renderer.js", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../scripts/graph/relation-graph-app.js", import.meta.url), "utf8");
  const graphTemplate = fs.readFileSync(new URL("../templates/graph/relation-graph.hbs", import.meta.url), "utf8");
  const editorTemplate = fs.readFileSync(new URL("../templates/graph/relation-editor.hbs", import.meta.url), "utf8");

  assert.match(renderer, /this\.#app\.canManageEdges && event\.button === 0 && event\.shiftKey/u);
  assert.match(renderer, /#beginRelationDrag\(event, entity\)/u);
  assert.match(renderer, /#entityAt\(pointer\.clientX, pointer\.clientY, source\.id\)/u);
  assert.match(renderer, /this\.#app\.createRelation\(source\.id, completedTargetId\)/u);
  assert.match(renderer, /class: "mit-edge-preview"/u);
  assert.match(app, /new RelationEditor\(\{[\s\S]*sourceId,[\s\S]*targetId,[\s\S]*directed: true/u);
  assert.match(app, /const source = this\.entity\(sourceId\);[\s\S]*const target = this\.entity\(targetId\);[\s\S]*if \(!source \|\| !target\) return/u);
  assert.doesNotMatch(graphTemplate, /data-action="relation"/u);
  assert.doesNotMatch(editorTemplate, /name="directed"/u);
  assert.match(editorTemplate, /name="mutual"/u);
  assert.match(graphTemplate, /orient="auto-start-reverse"/u);
  assert.match(renderer, /"marker-start": edge\.mutual/u);
});

test("relation targeting follows actor and faction shapes", () => {
  const actor = { kind: "actor", x: 10, y: 20, width: 100, height: 80 };
  const rectangle = { kind: "faction", shape: "rounded-rectangle", x: 0, y: 0, width: 200, height: 100 };
  const ellipse = { kind: "faction", shape: "ellipse", x: 0, y: 0, width: 200, height: 100 };
  const polygon = { kind: "faction", shape: "polygon", x: 0, y: 0, width: 200, height: 100 };

  assert.equal(entityContainsPoint(actor, { x: 50, y: 50 }), true);
  assert.equal(entityContainsPoint(actor, { x: 5, y: 50 }), false);
  assert.equal(entityContainsPoint(rectangle, { x: 5, y: 5 }), true);
  assert.equal(entityContainsPoint(ellipse, { x: 100, y: 50 }), true);
  assert.equal(entityContainsPoint(ellipse, { x: 5, y: 5 }), false);
  assert.equal(entityContainsPoint(polygon, { x: 100, y: 50 }), true);
  assert.equal(entityContainsPoint(polygon, { x: 5, y: 5 }), false);
});

test("the faction editor exposes only the five requested appearance fields", () => {
  const app = fs.readFileSync(new URL("../scripts/graph/relation-graph-app.js", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../scripts/graph/faction-editor.js", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/graph/faction-editor.hbs", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/medieval-investigation-toolkit.css", import.meta.url), "utf8");

  const fieldNames = [...template.matchAll(/name="([^"]+)"/gu)].map(match => match[1]);
  assert.deepEqual(fieldNames, ["name", "shape", "fill", "stroke", "fillOpacity"]);
  assert.doesNotMatch(template, /description|width|height|strokeWidth|data-faction-preview|memberNodeIds/u);
  assert.doesNotMatch(editor, /synchronizePreview|memberOptions|memberNodeIds/u);
  assert.doesNotMatch(app, /memberOptions/u);
  assert.doesNotMatch(css, /\.mit-faction-editor__layout|\.mit-faction-preview/u);
  assert.match(css, /\.mit-graph-faction\.is-relation-target/u);
  assert.match(editor, /style: \{\s*\.\.\.instance\.#faction\.style,/u);
  assert.match(app, /changedFields\(faction, updated, \["name", "shape", "style"\]\)/u);
});

test("actor nodes render only their token and reveal the name on hover", () => {
  const renderer = fs.readFileSync(new URL("../scripts/graph/relation-graph-renderer.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/medieval-investigation-toolkit.css", import.meta.url), "utf8");

  assert.match(renderer, /preserveAspectRatio: "xMidYMid meet"/u);
  assert.doesNotMatch(renderer, /mit-node-frame|mit-node-badge/u);
  assert.match(css, /\.mit-node-name \{ opacity: 0;/u);
  assert.match(css, /\.mit-graph-node:hover \.mit-node-name[^{]*\{ opacity: 1;/u);
  assert.match(renderer, /node\.hideAppearance && !node\.hideName \? " is-appearance-hidden"/u);
  assert.match(css, /\.mit-graph-node\.is-appearance-hidden \.mit-node-name \{ opacity: 1; \}/u);
  assert.match(css, /#eadbb5, #c9b382/u);
});

test("directional curves stop at token boundaries so arrowheads remain visible", () => {
  const source = { id: "A", kind: "actor", x: 0, y: 0, width: 100, height: 100 };
  const target = { id: "B", kind: "actor", x: 300, y: 0, width: 100, height: 100 };
  const curve = edgeCurve(source, target);

  assert.deepEqual(curve.a, { x: 100, y: 50 });
  assert.deepEqual(curve.b, { x: 300, y: 50 });
  assert.match(curve.d, /^M 100 50 C /u);
});

test("short faction relations leave the border without curving back inside", () => {
  const source = { id: "F", kind: "faction", shape: "rounded-rectangle", x: 0, y: 0, width: 500, height: 350 };
  const target = { id: "A", kind: "actor", x: 520, y: 125, width: 100, height: 100 };
  const curve = edgeCurve(source, target);

  assert.deepEqual(curve.a, { x: 500, y: 175 });
  assert.deepEqual(curve.b, { x: 520, y: 175 });
  for (const point of curve.segments[0]) assert.ok(point.x >= 500);
});

test("the graph background pans only with the right mouse button", () => {
  const renderer = fs.readFileSync(new URL("../scripts/graph/relation-graph-renderer.js", import.meta.url), "utf8");

  assert.match(renderer, /#onBackgroundPointerDown\(event\) \{[\s\S]*?if \(event\.button !== 2\) return;\s*event\.preventDefault\(\);/u);
  assert.match(renderer, /this\.#listen\(svg, "contextmenu",[\s\S]*?event\.preventDefault\(\);/u);
});

test("opposite relations receive separate lanes and arrow tangents aim at their targets", () => {
  const a = { id: "A", kind: "actor", x: 0, y: 0, width: 100, height: 100 };
  const b = { id: "B", kind: "actor", x: 300, y: 120, width: 100, height: 100 };
  const edges = [
    { id: "ab", sourceId: "A", targetId: "B" },
    { id: "ba", sourceId: "B", targetId: "A" }
  ];
  const lanes = allocateEdgeLanes(edges);
  const forward = edgeCurve(a, b, lanes.get("ab"));
  const backward = edgeCurve(b, a, lanes.get("ba"));
  const forwardMiddle = pointOnEdgeCurve(forward, 0.5);
  const backwardMiddle = pointOnEdgeCurve(backward, 0.5);
  const forwardLabel = edgeLabelPoint(forward, 0.5);
  const backwardLabel = edgeLabelPoint(backward, 0.5);

  assert.equal(lanes.get("ab"), -11);
  assert.equal(lanes.get("ba"), 11);
  assert.ok(Math.hypot(forwardMiddle.x - backwardMiddle.x, forwardMiddle.y - backwardMiddle.y) > 18);
  assert.ok(Math.hypot(forwardLabel.x - backwardLabel.x, forwardLabel.y - backwardLabel.y) > 35);

  const tangent = pointOnEdgeCurve(forward, 1);
  const targetCenter = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const targetVector = { x: targetCenter.x - forward.b.x, y: targetCenter.y - forward.b.y };
  assert.ok(tangent.dx * targetVector.x + tangent.dy * targetVector.y > 0);
  assert.ok(Math.abs(tangent.dx * targetVector.y - tangent.dy * targetVector.x) < 0.1);
});

test("the actor Edit action opens the privacy editor instead of the Actor sheet", () => {
  const app = fs.readFileSync(new URL("../scripts/graph/relation-graph-app.js", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../scripts/graph/node-editor.js", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/graph/node-editor.hbs", import.meta.url), "utf8");

  assert.match(app, /if \(entity\.kind === "faction"\) return this\.editFaction\(entityId\);[\s\S]*return this\.editNode\(entityId\)/u);
  assert.doesNotMatch(app, /actor\.sheet\.render/u);
  assert.match(editor, /hideName:[\s\S]*hideAppearance:/u);
  assert.match(editor, /instance\.#custom \|\| displayName !== instance\.#sourceName \? displayName : ""/u);
  assert.match(template, /name="displayName"/u);
  assert.match(template, /name="hideName"/u);
  assert.match(template, /name="hideAppearance"/u);
  assert.match(template, /name="dead"/u);
  assert.match(editor, /dead: data\.dead === true/u);
  assert.match(app, /HIDDEN_ACTOR_IMAGE/u);
  assert.doesNotMatch(app, /RemoveFromFaction|AddToFaction/u);
});

test("dead nodes display a passive translucent WFRP defeated overlay", () => {
  const renderer = fs.readFileSync(new URL("../scripts/graph/relation-graph-renderer.js", import.meta.url), "utf8");
  const constants = fs.readFileSync(new URL("../scripts/constants.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/medieval-investigation-toolkit.css", import.meta.url), "utf8");

  assert.match(constants, /DEFEATED_OVERLAY_IMAGE = "systems\/wfrp4e\/icons\/defeated\.png"/u);
  assert.match(renderer, /if \(node\.dead\)[\s\S]*width: node\.width,[\s\S]*height: node\.height,[\s\S]*href: DEFEATED_OVERLAY_IMAGE/u);
  assert.match(renderer, /opacity: deathOverlayOpacity\(\)/u);
  assert.match(renderer, /class: "mit-node-dead-overlay"/u);
  assert.match(css, /\.mit-node-dead-overlay \{ pointer-events: none; \}/u);
});

test("the GM can create a standalone node from an asset image and a name", () => {
  const app = fs.readFileSync(new URL("../scripts/graph/relation-graph-app.js", import.meta.url), "utf8");
  const data = fs.readFileSync(new URL("../scripts/graph/relation-graph-data.js", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../scripts/graph/custom-node-editor.js", import.meta.url), "utf8");
  const editorTemplate = fs.readFileSync(new URL("../templates/graph/custom-node-editor.hbs", import.meta.url), "utf8");
  const graphTemplate = fs.readFileSync(new URL("../templates/graph/relation-graph.hbs", import.meta.url), "utf8");

  assert.match(graphTemplate, /data-action="new-node" \{\{#unless canManageNodes\}\}disabled/u);
  assert.match(app, /if \(action === "new-node"\) return this\.createCustomNode\(\)/u);
  assert.match(app, /createCustomNode\(\)[\s\S]*if \(!this\.canManageNodes\) return/u);
  assert.match(app, /createCustomNode\(\)[\s\S]*name: node\.name,[\s\S]*image: node\.image,[\s\S]*kind: "addCustomNode"/u);
  assert.match(app, /if \(!node\.actorUuid\)[\s\S]*missing: false,[\s\S]*name: node\.nameOverride,[\s\S]*image: node\.imageOverride/u);
  assert.match(data, /isStandalone = !hasActor && Boolean\(node\.nameOverride && node\.imageOverride\)/u);
  assert.match(editor, /openFilePicker/u);
  assert.match(editorTemplate, /name="name"[^>]*required/u);
  assert.match(editorTemplate, /name="image"[^>]*required/u);
});

test("players use the graph's shared actor name and token unless an explicit hide option is active", () => {
  const app = fs.readFileSync(new URL("../scripts/graph/relation-graph-app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /anonymizeUnauthorized/u);
  assert.match(app, /if \(!this\.canManageNodes\)[\s\S]*name: node\.cachedName[\s\S]*image: node\.cachedImage/u);
  assert.match(app, /node\?\.hideName[\s\S]*node\?\.nameOverride \|\| cached\.name/u);
  assert.match(app, /node\?\.hideAppearance[\s\S]*HIDDEN_ACTOR_IMAGE[\s\S]*node\?\.imageOverride \|\| cached\.image/u);
});

test("a hidden actor name uses the requested French label", () => {
  const french = JSON.parse(fs.readFileSync(new URL("../languages/fr.json", import.meta.url), "utf8"));
  assert.equal(french["medieval-investigation-toolkit"].NodeEditor.UnknownName, "Inconnu");
});

test("relation presets expose the requested labels and automatic colors", () => {
  const french = JSON.parse(fs.readFileSync(new URL("../languages/fr.json", import.meta.url), "utf8"))["medieval-investigation-toolkit"].Relations;
  const actual = Object.fromEntries(RELATION_PRESETS.map(preset => [french[preset.key], preset.color]));
  assert.equal(RELATION_PRESETS.length, 29);
  assert.deepEqual(actual, {
    "Favorable à": "#2E7D32",
    "Opposé à": "#B3261E",
    "Profite de": "#B8860B",
    "Subit": "#616161",
    "Défend": "#2E7D32",
    "Combat": "#B3261E",
    "A tué": "#B3261E",
    "Finance": "#B8860B",
    "Soutient": "#2E7D32",
    "Influence": "#6A1B9A",
    "Manipule": "#6A1B9A",
    "Contrôle": "#6A1B9A",
    "Protège": "#2E7D32",
    "Sert": "#1F1F1F",
    "Travaille pour": "#1F1F1F",
    "Est membre de": "#1F1F1F",
    "Représente": "#1F1F1F",
    "Surveille": "#C65D00",
    "Enquête sur": "#C65D00",
    "Cache": "#1F4E79",
    "Connaît le secret de": "#1F4E79",
    "Dépend de": "#616161",
    "Allié de": "#2E7D32",
    "Rival de": "#B3261E",
    "Ennemi de": "#B3261E",
    "Ami": "#2E7D32",
    "Marié à": "#AD1457",
    "Amant": "#AD1457",
    "Parent de": "#6D4C41"
  });
  const editor = fs.readFileSync(new URL("../scripts/graph/relation-editor.js", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/graph/relation-editor.hbs", import.meta.url), "utf8");
  assert.match(editor, /option\?\.dataset\?\.color/u);
  assert.match(template, /data-color="\{\{color\}\}"/u);
});

test("relation labels can be created, sorted, persisted, and deleted with their edges", () => {
  const app = fs.readFileSync(new URL("../scripts/graph/relation-graph-app.js", import.meta.url), "utf8");
  const data = fs.readFileSync(new URL("../scripts/graph/relation-graph-data.js", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../scripts/graph/relation-editor.js", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/graph/relation-editor.hbs", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/medieval-investigation-toolkit.css", import.meta.url), "utf8");

  assert.match(editor, /options\.sort\(\(left, right\) => left\.label\.localeCompare/u);
  assert.match(editor, /newRelationLabel: requestedNewLabel && !existing/u);
  assert.match(template, /name="labelChoice"/u);
  assert.match(template, /name="newLabel"/u);
  assert.match(template, /data-action="delete-label"/u);
  assert.match(app, /kind: "addEdge"[\s\S]*newRelationLabel/u);
  assert.match(app, /deleteRelationLabel\(definition\)[\s\S]*kind: "removeRelationLabel"/u);
  assert.match(data, /state\.edges = state\.edges\.filter\(edge => normalizedLabel\(edge\.label\) !== name\)/u);
  assert.match(css, /\.mit-form \.mit-relation-color \{ flex: 0 0 5rem; width: 5rem; min-width: 5rem; max-width: 5rem;/u);
  assert.match(css, /\.mit-form \.mit-relation-width \{ flex: 0 0 3\.5rem; width: 3\.5rem; min-width: 3\.5rem; max-width: 3\.5rem;/u);
});

test("polygon relations stop on the visible faction outline", () => {
  const source = { id: "F", kind: "faction", shape: "polygon", x: 0, y: 0, width: 200, height: 100 };
  const target = { id: "A", kind: "actor", x: -300, y: -200, width: 100, height: 100 };
  const curve = edgeCurve(source, target);

  assert.ok(curve.a.x > 0);
  assert.ok(curve.a.y > 0);
  assert.equal(entityContainsPoint(source, curve.a), true);
});

test("players can move actor nodes and manage links without receiving node editors", () => {
  const app = fs.readFileSync(new URL("../scripts/graph/relation-graph-app.js", import.meta.url), "utf8");
  const renderer = fs.readFileSync(new URL("../scripts/graph/relation-graph-renderer.js", import.meta.url), "utf8");
  const store = fs.readFileSync(new URL("../scripts/graph/relation-graph-store.js", import.meta.url), "utf8");
  const mutations = fs.readFileSync(new URL("../scripts/graph/relation-graph-mutations.js", import.meta.url), "utf8");
  assert.match(app, /get canManageNodes\(\)[\s\S]*game\.user\?\.isGM/u);
  assert.match(app, /get canDeleteNodes\(\)[\s\S]*"deleteNode"/u);
  assert.match(app, /get canManageEdges\(\)[\s\S]*"updateEdge"/u);
  assert.match(renderer, /this\.#app\.canManageEdges[\s\S]*#beginRelationDrag/u);
  assert.match(renderer, /this\.#app\.canMoveEntity\(entity\)[\s\S]*#beginDrag/u);
  assert.match(renderer, /applyEntityPreviews\(positions = \[\]\)/u);
  assert.match(app, /canModifyGraph\(game\.user, "moveNode"\)/u);
  assert.match(store, /applyGraphMutation/u);
  assert.match(mutations, /case "moveEntities"/u);
});
