import { HIDDEN_ACTOR_IMAGE, MODULE_ID } from "../constants.js";
import { applicationClasses } from "../compatibility/foundry-version.js";
import {
  deserializeGraph,
  normalizeGraph,
  serializeGraph
} from "./relation-graph-data.js";
import { relationGraphStore } from "./relation-graph-store.js";
import { RelationGraphRenderer } from "./relation-graph-renderer.js";
import { CustomNodeEditor } from "./custom-node-editor.js";
import { FactionEditor } from "./faction-editor.js";
import { NodeEditor } from "./node-editor.js";
import { RelationEditor } from "./relation-editor.js";
import { actorTokenImage, canViewDocument, resolveUuid } from "../utils/documents.js";
import { canModifyGraph } from "../utils/permissions.js";
import { getSetting } from "../settings.js";
import { logger } from "../utils/log.js";
import { socketService } from "../board/board-sockets.js";
import { changedFields } from "../utils/concurrency.js";
import { randomId } from "../utils/ids.js";

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();
const clone = value => structuredClone(value);
const normalizedLabel = value => String(value || "").trim().normalize("NFKC").toLocaleLowerCase();

let activeGraphApp = null;

function i18nError(error) {
  const message = String(error?.message || error || "Errors.RequestRejected");
  const key = message.startsWith(`${MODULE_ID}.`) ? message : `${MODULE_ID}.${message}`;
  return game.i18n.has?.(key) ? game.i18n.localize(key) : message;
}

export class RelationGraphApp extends HandlebarsApplicationMixin(ApplicationV2) {
  graph = null;
  page = null;
  selected = null;
  #renderer = null;
  #history = [];
  #future = [];
  #presentations = new Map();
  #mutationQueue = Promise.resolve();
  #pendingMutations = 0;
  #deferredGraph = null;
  #interactiveBefore = null;
  #contextMenu = null;
  #unsubscribeDragPreview = null;
  #remoteDragPreviews = new Map();
  #lastDragBroadcast = 0;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-relation-graph`,
    classes: [MODULE_ID, "mit-relation-graph-app"],
    window: { title: `${MODULE_ID}.Graph.WindowTitle`, icon: "fa-solid fa-diagram-project", resizable: true },
    position: { width: 1050, height: 760 }
  };

  static PARTS = { graph: { template: `modules/${MODULE_ID}/templates/graph/relation-graph.hbs` } };

  constructor(options = {}) {
    super(options);
    this.#unsubscribeDragPreview = socketService.onEvent("graph.drag-preview", (payload, user) => {
      this.#receiveDragPreview(payload, user);
    });
  }

  get canEdit() {
    return canModifyGraph(game.user, "createEdge");
  }

  get canManageNodes() {
    return Boolean(game.user?.isGM);
  }

  get canDeleteNodes() {
    return canModifyGraph(game.user, "deleteNode");
  }

  get canManageEdges() {
    return canModifyGraph(game.user, "updateEdge");
  }

  canMoveEntity(entity) {
    if (entity?.kind === "actor") return canModifyGraph(game.user, "moveNode") && !this.#isRemotelyDragged(entity.id);
    return this.canManageNodes && !this.#isRemotelyDragged(entity?.id);
  }

  async _prepareContext() {
    if (!this.graph) {
      const loaded = await relationGraphStore.load();
      this.page = loaded.page;
      this.graph = loaded.graph;
      await this.#hydrateNodes();
    }
    return {
      canEdit: this.canEdit,
      canManageNodes: this.canManageNodes,
      canUndo: this.#history.length > 0,
      canRedo: this.#future.length > 0,
      toolSelect: true,
      saveStatus: this.#pendingMutations ? game.i18n.localize(`${MODULE_ID}.Graph.Saving`) : game.i18n.localize(`${MODULE_ID}.Graph.Saved`)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    activeGraphApp = this;
    this.#renderer?.destroy();
    const svg = this.element.querySelector("[data-relation-graph]");
    this.#renderer = new RelationGraphRenderer(this, svg);
    this.#renderer.render();
    for (const button of this.element.querySelectorAll("[data-action]")) {
      button.addEventListener("click", () => this.#toolbar(button.dataset.action));
    }
    const input = this.element.querySelector("[data-import-file]");
    input?.addEventListener("change", event => this.#importFile(event.target.files?.[0]));
    this.element.addEventListener("keydown", event => this.#onKeyDown(event));
  }

  async _onClose(options) {
    try { await this.save(); } catch (_error) { /* Error was already reported. */ }
    this.cancelInteractiveChange();
    this.#renderer?.destroy();
    this.#renderer = null;
    this.#contextMenu?.remove();
    this.#unsubscribeDragPreview?.();
    this.#unsubscribeDragPreview = null;
    for (const preview of this.#remoteDragPreviews.values()) globalThis.clearTimeout(preview.timer);
    this.#remoteDragPreviews.clear();
    if (activeGraphApp === this) activeGraphApp = null;
    return super._onClose(options);
  }

  entity(id) {
    return this.graph.nodes.find(node => node.id === id) || this.graph.factions.find(faction => faction.id === id) || null;
  }

  nodePresentation(id) {
    const node = this.graph.nodes.find(item => item.id === id);
    const cached = this.#presentations.get(id) || {};
    const factions = node?.factionIds.map(factionId => this.graph.factions.find(faction => faction.id === factionId)?.name).filter(Boolean) || [];
    return {
      name: node?.hideName
        ? game.i18n.localize(`${MODULE_ID}.NodeEditor.UnknownName`)
        : node?.nameOverride || cached.name || node?.cachedName || game.i18n.localize(`${MODULE_ID}.Labels.MissingReference`),
      image: node?.hideAppearance
        ? HIDDEN_ACTOR_IMAGE
        : node?.imageOverride || cached.image || node?.cachedImage || getSetting("unknownActorImage"),
      missing: Boolean(cached.missing),
      factions
    };
  }

  async #hydrateNodes() {
    for (const node of this.graph.nodes) {
      if (!node.actorUuid) {
        this.#presentations.set(node.id, {
          missing: false,
          name: node.nameOverride,
          image: node.imageOverride
        });
        continue;
      }
      if (!this.canManageNodes) {
        this.#presentations.set(node.id, {
          missing: false,
          name: node.cachedName || game.i18n.localize(`${MODULE_ID}.Labels.MissingReference`),
          image: node.cachedImage || getSetting("unknownActorImage")
        });
        continue;
      }
      const actor = await resolveUuid(node.actorUuid);
      if (!actor) {
        this.#presentations.set(node.id, { missing: true, name: node.cachedName || game.i18n.localize(`${MODULE_ID}.Labels.MissingReference`), image: node.cachedImage || getSetting("unknownActorImage") });
        continue;
      }
      const currentName = actor.name || "";
      const currentImage = actorTokenImage(actor, getSetting("unknownActorImage"));
      this.#presentations.set(node.id, { missing: false, name: currentName, image: currentImage, actor });
    }
  }

  async handleDrop(event) {
    event.preventDefault();
    if (!this.canManageNodes) return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.Errors.PermissionDenied`));
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch (_error) { return; }
    const actor = await resolveUuid(data.uuid || (data.type === "Actor" && data.id ? `Actor.${data.id}` : ""));
    if (!actor || actor.documentName !== "Actor" || !canViewDocument(actor)) {
      return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.Errors.ActorRequired`));
    }
    const point = this.#renderer.clientToGraph(event.clientX, event.clientY);
    const node = {
      id: randomId(),
      actorUuid: actor.uuid,
      x: point.x - getSetting("nodeSize") / 2,
      y: point.y - getSetting("nodeSize") / 2,
      width: getSetting("nodeSize"),
      height: getSetting("nodeSize"),
      cachedName: actor.name,
      cachedImage: actorTokenImage(actor, getSetting("unknownActorImage"))
    };
    const response = await this.#commitMutation(
      { kind: "addActorNode", node },
      { undo: { kind: "removeEntity", entityId: node.id } }
    );
    this.selected = { kind: "actor", id: response.result.entityId };
    this.#renderer?.render();
  }

  select(selection) {
    this.selected = selection;
    this.#renderer?.render();
  }

  refreshAssets() {
    this.#renderer?.render();
  }

  beginInteractiveChange() {
    if (this.#interactiveBefore) return;
    this.#interactiveBefore = clone(this.graph);
    this.previewInteractiveChange(true);
  }

  previewInteractiveChange(force = false) {
    if (!this.#interactiveBefore) return;
    const positions = this.#movementEntries(this.#interactiveBefore, this.graph).map(entry => ({
      entityId: entry.entityId,
      ...entry.changes
    }));
    if (positions.length) this.#publishDragPreview("move", positions, force);
  }

  async commitInteractiveChange() {
    if (!this.#interactiveBefore) return;
    const before = this.#interactiveBefore;
    const entries = this.#movementEntries(before, this.graph);
    this.#interactiveBefore = null;
    if (!entries.length) {
      this.#publishDragPreview("end", [], true);
      return this.#applyDeferredGraph();
    }
    const undoEntries = entries.map(entry => ({
      entityId: entry.entityId,
      changes: clone(entry.expected),
      expected: clone(entry.changes)
    }));
    const mutation = { kind: "moveEntities", entries, addMemberships: true };
    this.#publishDragPreview("move", entries.map(entry => ({ entityId: entry.entityId, ...entry.changes })), true);
    try {
      await this.#commitMutation(mutation, {
        undo: { kind: "moveEntities", entries: undoEntries, addMemberships: false }
      });
    } finally {
      this.#publishDragPreview("end", [], true);
    }
  }

  cancelInteractiveChange() {
    if (!this.#interactiveBefore) return;
    const viewport = clone(this.graph.viewport);
    this.graph = this.#interactiveBefore;
    this.graph.viewport = viewport;
    this.#interactiveBefore = null;
    this.#renderer?.render();
    this.#publishDragPreview("end", [], true);
    void this.#applyDeferredGraph();
  }

  graphChanged({ viewportOnly = false } = {}) {
    if (!viewportOnly) this.#renderer?.render();
  }

  async save() {
    await this.#mutationQueue;
    await this.#applyDeferredGraph();
  }

  #pushHistory(undo, redo) {
    if (!undo || !redo) return;
    this.#history.push({ undo: clone(undo), redo: clone(redo) });
    if (this.#history.length > 50) this.#history.shift();
    this.#future = [];
    this.#updateStatus();
  }

  #commitMutation(mutation, { undo = null, recordHistory = true } = {}) {
    this.#pendingMutations += 1;
    this.#updateStatus();
    const execute = async () => {
      try {
        const response = await relationGraphStore.mutate(this.page, mutation);
        await this.#acceptCanonicalGraph(response.graph);
        if (recordHistory && undo && response.result?.changed !== false) this.#pushHistory(undo, mutation);
        return response;
      } catch (error) {
        ui.notifications.error(i18nError(error));
        logger.warn("Graph mutation failed", mutation?.kind, error);
        const current = this.page?.getFlag?.(MODULE_ID, "relationGraph");
        if (current) await this.#acceptCanonicalGraph(current);
        throw error;
      } finally {
        this.#pendingMutations = Math.max(0, this.#pendingMutations - 1);
        if (!this.#pendingMutations && !this.#interactiveBefore) await this.#applyDeferredGraph();
        this.#updateStatus();
      }
    };
    const operation = this.#mutationQueue.then(execute, execute);
    this.#mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async #acceptCanonicalGraph(graph) {
    if (!graph) return;
    if (this.#interactiveBefore) {
      if (!this.#deferredGraph || Number(graph.revision) >= Number(this.#deferredGraph.revision)) this.#deferredGraph = clone(graph);
      return;
    }
    const viewport = clone(this.graph?.viewport || graph.viewport);
    this.graph = normalizeGraph(graph);
    this.graph.viewport = viewport;
    if (this.selected && !this.entity(this.selected.id) && !this.graph.edges.some(edge => edge.id === this.selected.id)) this.selected = null;
    await this.#hydrateNodes();
    this.#renderer?.render();
    this.#renderRemoteDragPreviews();
  }

  async #applyDeferredGraph() {
    if (!this.#deferredGraph || this.#interactiveBefore || this.#pendingMutations) return;
    const deferred = this.#deferredGraph;
    this.#deferredGraph = null;
    if (Number(deferred.revision) >= Number(this.graph?.revision || 0)) await this.#acceptCanonicalGraph(deferred);
  }

  #movementEntries(before, after) {
    const entries = [];
    for (const current of [...after.nodes, ...after.factions]) {
      const initial = [...before.nodes, ...before.factions].find(item => item.id === current.id);
      if (!initial) continue;
      const keys = current.kind === "actor" ? ["x", "y"] : ["x", "y", "width", "height"];
      const changed = changedFields(initial, current, keys);
      if (Object.keys(changed.changes).length) entries.push({ entityId: current.id, ...changed });
    }
    return entries;
  }

  #publishDragPreview(phase, positions, force = false) {
    const now = Date.now();
    if (!force && now - this.#lastDragBroadcast < 50) return;
    this.#lastDragBroadcast = now;
    socketService.publish("graph.drag-preview", {
      pageUuid: this.page?.uuid,
      phase,
      positions: positions.slice(0, 500)
    });
  }

  #receiveDragPreview(payload, user) {
    if (!this.page || payload?.pageUuid !== this.page.uuid || !user?.active) return;
    const existing = this.#remoteDragPreviews.get(user.id);
    if (existing?.timer) globalThis.clearTimeout(existing.timer);
    if (payload.phase === "end") {
      this.#remoteDragPreviews.delete(user.id);
      return this.#renderRemoteDragPreviews();
    }
    const positions = (Array.isArray(payload.positions) ? payload.positions : []).slice(0, 500)
      .map(position => ({
        entityId: String(position?.entityId || ""),
        x: Number(position?.x),
        y: Number(position?.y),
        width: position?.width === undefined ? undefined : Number(position.width),
        height: position?.height === undefined ? undefined : Number(position.height)
      }))
      .filter(position => position.entityId && Number.isFinite(position.x) && Number.isFinite(position.y));
    if (!positions.length) return;
    const timer = globalThis.setTimeout(() => {
      this.#remoteDragPreviews.delete(user.id);
      this.#renderRemoteDragPreviews();
    }, 2_000);
    this.#remoteDragPreviews.set(user.id, { positions, timer });
    this.#renderRemoteDragPreviews();
  }

  #renderRemoteDragPreviews() {
    const positions = [];
    for (const preview of this.#remoteDragPreviews.values()) positions.push(...preview.positions);
    this.#renderer?.applyEntityPreviews(positions);
  }

  #isRemotelyDragged(entityId) {
    for (const preview of this.#remoteDragPreviews.values()) {
      if (preview.positions.some(position => position.entityId === entityId)) return true;
    }
    return false;
  }

  #updateStatus() {
    const status = this.element?.querySelector?.(".mit-save-status");
    if (status) status.textContent = this.#pendingMutations
      ? game.i18n.localize(`${MODULE_ID}.Graph.Saving`)
      : game.i18n.localize(`${MODULE_ID}.Graph.Saved`);
    const undo = this.element?.querySelector?.('[data-action="undo"]');
    const redo = this.element?.querySelector?.('[data-action="redo"]');
    if (undo) undo.disabled = !this.#history.length || Boolean(this.#pendingMutations);
    if (redo) redo.disabled = !this.#future.length || Boolean(this.#pendingMutations);
  }

  #toolbar(action) {
    if (action === "select") {
      this.#renderer?.cancelInteraction();
      return this.select(null);
    }
    if (action === "new-node") return this.createCustomNode();
    if (action === "new-faction") return this.createFaction();
    if (action === "fit") return this.#renderer.fit();
    if (action === "save") return this.save();
    if (action === "undo") return this.undo();
    if (action === "redo") return this.redo();
    if (action === "export") return this.exportJson();
    if (action === "import") return this.element.querySelector("[data-import-file]")?.click();
  }

  createCustomNode() {
    if (!this.canManageNodes) return;
    const rect = this.element.querySelector("[data-relation-graph]").getBoundingClientRect();
    const point = this.#renderer.clientToGraph(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const size = Number(getSetting("nodeSize"));
    new CustomNodeEditor({}, async node => {
      const input = {
        id: randomId(),
        name: node.name,
        image: node.image,
        x: point.x - size / 2,
        y: point.y - size / 2,
        width: size,
        height: size
      };
      const response = await this.#commitMutation(
        { kind: "addCustomNode", node: input },
        { undo: { kind: "removeEntity", entityId: input.id } }
      );
      this.selected = { kind: "actor", id: response.result.entityId };
      this.#renderer?.render();
    }).render({ force: true });
  }

  createFaction() {
    if (!this.canManageNodes) return;
    const rect = this.element.querySelector("[data-relation-graph]").getBoundingClientRect();
    const point = this.#renderer.clientToGraph(rect.left + rect.width / 2, rect.top + rect.height / 2);
    new FactionEditor({
      x: point.x - 250,
      y: point.y - 175,
      style: {
        fill: getSetting("factionFill"),
        fillOpacity: getSetting("factionOpacity"),
        stroke: getSetting("factionFill"),
        strokeWidth: 3
      }
    }, async faction => {
      const input = { ...faction, id: randomId() };
      const response = await this.#commitMutation(
        { kind: "addFaction", faction: input },
        { undo: { kind: "removeEntity", entityId: input.id } }
      );
      this.selected = { kind: "faction", id: response.result.entityId };
      this.#renderer?.render();
    }).render({ force: true });
  }

  createRelation(sourceId, targetId) {
    if (!this.canManageEdges) return;
    const source = this.entity(sourceId);
    const target = this.entity(targetId);
    if (!source || !target) return;
    if (sourceId === targetId) return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.Errors.SelfConnection`));
    new RelationEditor({
      sourceId,
      targetId,
      directed: true,
      mutual: false,
      relationLabels: clone(this.graph.relationLabels),
      disabledRelationPresetKeys: clone(this.graph.disabledRelationPresetKeys),
      style: { color: getSetting("edgeColor"), width: getSetting("edgeWidth"), lineStyle: "solid" }
    }, {
      save: async edge => {
        const { newRelationLabel, ...edgeData } = edge;
        edgeData.id = randomId();
        const response = await this.#commitMutation(
          { kind: "addEdge", edge: edgeData, newRelationLabel },
          { undo: { kind: "removeEdge", edgeId: edgeData.id } }
        );
        this.selected = { kind: "edge", id: response.result.edgeId };
        this.#renderer?.render();
      },
      deleteLabel: definition => this.deleteRelationLabel(definition)
    }).render({ force: true });
  }

  openEntity(entityId) {
    const entity = this.entity(entityId);
    if (!entity) return;
    if (entity.kind === "faction") return this.editFaction(entityId);
    return this.editNode(entityId);
  }

  editNode(nodeId) {
    if (!this.canManageNodes) return;
    const node = this.graph.nodes.find(item => item.id === nodeId);
    if (!node) return;
    const sourceName = this.#presentations.get(nodeId)?.name || node.cachedName || "";
    new NodeEditor({ ...clone(node), sourceName, custom: !node.actorUuid }, async updated => {
      const changed = changedFields(node, updated, ["nameOverride", "hideName", "hideAppearance", "dead"]);
      if (!Object.keys(changed.changes).length) return;
      await this.#commitMutation(
        { kind: "updateEntity", entityId: nodeId, ...changed },
        { undo: { kind: "updateEntity", entityId: nodeId, changes: changed.expected, expected: changed.changes } }
      );
    }).render({ force: true });
  }

  editFaction(factionId) {
    if (!this.canManageNodes) return;
    const faction = this.entity(factionId);
    new FactionEditor(clone(faction), async updated => {
      const changed = changedFields(faction, updated, ["name", "shape", "style"]);
      if (!Object.keys(changed.changes).length) return;
      await this.#commitMutation(
        { kind: "updateEntity", entityId: factionId, ...changed },
        { undo: { kind: "updateEntity", entityId: factionId, changes: changed.expected, expected: changed.changes } }
      );
    }).render({ force: true });
  }

  editEdge(edgeId) {
    if (!this.canManageEdges) return;
    const edge = this.graph.edges.find(item => item.id === edgeId);
    if (!edge) return;
    new RelationEditor({
      ...clone(edge),
      relationLabels: clone(this.graph.relationLabels),
      disabledRelationPresetKeys: clone(this.graph.disabledRelationPresetKeys)
    }, {
      save: async updated => {
        const { newRelationLabel, ...edgeData } = updated;
        const changed = changedFields(edge, edgeData, ["label", "mutual", "labelPosition", "style"]);
        if (!Object.keys(changed.changes).length && !newRelationLabel) return;
        await this.#commitMutation(
          { kind: "updateEdge", edgeId, ...changed, newRelationLabel },
          { undo: Object.keys(changed.changes).length
            ? { kind: "updateEdge", edgeId, changes: changed.expected, expected: changed.changes }
            : null }
        );
      },
      deleteLabel: definition => this.deleteRelationLabel(definition)
    }).render({ force: true });
  }

  async deleteRelationLabel(definition) {
    if (!this.canManageEdges) return;
    const stored = definition.id ? this.graph.relationLabels.find(label => label.id === definition.id) : null;
    const completeDefinition = { ...definition, ...(stored || {}) };
    const labelName = normalizedLabel(completeDefinition.label);
    const removedEdges = this.graph.edges.filter(edge => normalizedLabel(edge.label) === labelName).map(clone);
    const response = await this.#commitMutation(
      { kind: "removeRelationLabel", definition: completeDefinition },
      { undo: { kind: "restoreRelationLabel", definition: completeDefinition, edges: removedEdges } }
    );
    if (response.result.changed && this.selected?.kind === "edge" && !this.graph.edges.some(edge => edge.id === this.selected.id)) this.selected = null;
  }

  addMembershipsAtPosition(_nodeId) {
    // Membership additions are calculated by the authority as part of the
    // atomic moveEntities mutation.
  }

  async deleteSelected() {
    if (!this.selected) return;
    const selection = clone(this.selected);
    const allowed = selection.kind === "edge"
      ? canModifyGraph(game.user, "deleteEdge")
      : selection.kind === "actor"
        ? this.canDeleteNodes
        : this.canManageNodes;
    if (!allowed) return;
    if (selection.kind === "edge") {
      const edge = this.graph.edges.find(item => item.id === selection.id);
      if (!edge) return;
      await this.#commitMutation(
        { kind: "removeEdge", edgeId: selection.id },
        { undo: { kind: "addEdge", edge: clone(edge) } }
      );
    } else {
      const target = this.entity(selection.id);
      if (!target) return;
      const incidentEdges = this.graph.edges.filter(edge => edge.sourceId === selection.id || edge.targetId === selection.id).map(clone);
      await this.#commitMutation(
        { kind: "removeEntity", entityId: selection.id },
        { undo: game.user.isGM ? { kind: "restoreEntity", entity: clone(target), edges: incidentEdges } : null }
      );
    }
    this.selected = null;
    this.#renderer?.render();
  }

  openEntityMenu(entityId, x, y) {
    const entity = this.entity(entityId);
    if (!entity) return;
    this.select({ kind: entity.kind, id: entityId });
    const actions = [];
    if (this.canManageNodes) actions.push(["Edit", () => this.openEntity(entityId)]);
    if (entity.kind === "actor" ? this.canDeleteNodes : this.canManageNodes) {
      actions.push(["Delete", () => this.deleteSelected()]);
    }
    if (!actions.length) return;
    this.#openMenu(x, y, actions);
  }

  openEdgeMenu(edgeId, x, y) {
    if (!this.canManageEdges) return;
    this.select({ kind: "edge", id: edgeId });
    this.#openMenu(x, y, [["Edit", () => this.editEdge(edgeId)], ["Delete", () => this.deleteSelected()]]);
  }

  #openMenu(x, y, actions) {
    this.#contextMenu?.remove();
    const menu = document.createElement("menu");
    menu.className = "mit-context-menu";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    for (const [key, action, suffix] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${game.i18n.localize(`${MODULE_ID}.Actions.${key}`)}${suffix ? `: ${suffix}` : ""}`;
      button.addEventListener("click", async () => { menu.remove(); await action(); });
      menu.appendChild(button);
    }
    document.body.appendChild(menu);
    this.#contextMenu = menu;
    globalThis.setTimeout(() => document.addEventListener("pointerdown", event => { if (!menu.contains(event.target)) menu.remove(); }, { once: true }), 0);
  }

  async undo() {
    const entry = this.#history.pop();
    if (!entry) return;
    try {
      await this.#commitMutation(entry.undo, { recordHistory: false });
      this.#future.push(entry);
      this.selected = null;
    } catch (_error) {
      this.#history.push(entry);
    }
    this.#updateStatus();
  }

  async redo() {
    const entry = this.#future.pop();
    if (!entry) return;
    try {
      await this.#commitMutation(entry.redo, { recordHistory: false });
      this.#history.push(entry);
      this.selected = null;
    } catch (_error) {
      this.#future.push(entry);
    }
    this.#updateStatus();
  }

  exportJson() {
    const blob = new Blob([serializeGraph(this.graph)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${this.graph.id}.json`;
    anchor.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async #importFile(file) {
    if (!file || !this.canManageNodes) return;
    try {
      const imported = deserializeGraph(await file.text());
      const previous = clone(this.graph);
      await this.#commitMutation(
        { kind: "replaceGraph", graph: imported },
        { undo: { kind: "replaceGraph", graph: previous } }
      );
      this.selected = null;
    } catch (error) {
      logger.warn("Graph import rejected", error);
      ui.notifications.error(game.i18n.localize(`${MODULE_ID}.Errors.InvalidGraphImport`));
    }
  }

  #onKeyDown(event) {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if (event.key === "Escape") {
      this.#renderer?.cancelInteraction();
      this.select(null);
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      return this.deleteSelected();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      return this.save();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      return event.shiftKey ? this.redo() : this.undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      return this.redo();
    }
  }

  async externalPageUpdated(page) {
    if (page.uuid !== this.page?.uuid) return;
    const graph = normalizeGraph(page.getFlag(MODULE_ID, "relationGraph"));
    if (this.#pendingMutations || this.#interactiveBefore) {
      if (!this.#deferredGraph || Number(graph.revision) >= Number(this.#deferredGraph.revision)) this.#deferredGraph = graph;
      return;
    }
    if (Number(graph.revision) < Number(this.graph?.revision || 0)) return;
    await this.#acceptCanonicalGraph(graph);
  }

  async sourceActorChanged(actor, deleted = false) {
    if (!this.canManageNodes) return;
    const nodes = this.graph?.nodes?.filter(node => node.actorUuid === actor.uuid) || [];
    if (!nodes.length) return;
    for (const node of nodes) {
      if (deleted) {
        this.#presentations.set(node.id, {
          missing: true,
          name: node.cachedName || game.i18n.localize(`${MODULE_ID}.Labels.MissingReference`),
          image: node.cachedImage || getSetting("unknownActorImage")
        });
        continue;
      }
      const image = actorTokenImage(actor, getSetting("unknownActorImage"));
      if (socketService.isAuthority()) {
        const changed = changedFields(node, { cachedName: actor.name, cachedImage: image }, ["cachedName", "cachedImage"]);
        if (Object.keys(changed.changes).length) {
          void this.#commitMutation(
            { kind: "updateEntity", entityId: node.id, ...changed },
            { recordHistory: false }
          );
        }
      }
      this.#presentations.set(node.id, { missing: false, name: actor.name, image, actor });
    }
    this.#renderer?.render();
  }
}

export async function openRelationGraph() {
  if (activeGraphApp?.rendered) {
    activeGraphApp.bringToFront();
    return activeGraphApp;
  }
  activeGraphApp = new RelationGraphApp();
  await activeGraphApp.render({ force: true });
  return activeGraphApp;
}

export function notifyGraphPageUpdated(page) {
  return activeGraphApp?.externalPageUpdated(page);
}

export function notifyGraphActorChanged(actor, deleted = false) {
  return activeGraphApp?.sourceActorChanged(actor, deleted);
}

export function notifyGraphAssetsChanged() {
  activeGraphApp?.refreshAssets();
}
