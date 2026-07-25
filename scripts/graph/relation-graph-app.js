import { HIDDEN_ACTOR_IMAGE, MODULE_ID } from "../constants.js";
import { applicationClasses } from "../compatibility/foundry-version.js";
import {
  addActorNode,
  addCustomNode,
  addEdge,
  addFaction,
  addRelationLabel,
  deserializeGraph,
  normalizeGraph,
  removeEdge,
  removeEntity,
  removeRelationLabel,
  serializeGraph,
  setMembership,
  updateEntity
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

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();
const clone = value => structuredClone(value);

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
  #savePromise = null;
  #saving = false;
  #dirty = false;
  #interactiveBefore = null;
  #contextMenu = null;
  #changeSerial = 0;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-relation-graph`,
    classes: [MODULE_ID, "mit-relation-graph-app"],
    window: { title: `${MODULE_ID}.Graph.WindowTitle`, icon: "fa-solid fa-diagram-project", resizable: true },
    position: { width: 1050, height: 760 }
  };

  static PARTS = { graph: { template: `modules/${MODULE_ID}/templates/graph/relation-graph.hbs` } };

  get canEdit() {
    return canModifyGraph(game.user, "save");
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

  canMoveEntity(_entity) {
    return this.canManageNodes;
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
      saveStatus: this.#saving ? game.i18n.localize(`${MODULE_ID}.Graph.Saving`) : this.#dirty ? game.i18n.localize(`${MODULE_ID}.Graph.Unsaved`) : game.i18n.localize(`${MODULE_ID}.Graph.Saved`)
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
    if (this.#dirty && this.canEdit) {
      try { await this.save(); } catch (_error) { /* Error was already reported. */ }
    }
    this.#renderer?.destroy();
    this.#renderer = null;
    this.#contextMenu?.remove();
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
    let changed = false;
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
      if (this.canManageNodes && (node.cachedName !== currentName || node.cachedImage !== currentImage)) {
        node.cachedName = currentName;
        node.cachedImage = currentImage;
        changed = true;
      }
      this.#presentations.set(node.id, { missing: false, name: currentName, image: currentImage, actor });
    }
    if (changed && this.canManageNodes) this.graphChanged();
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
    this.#recordHistory();
    const result = addActorNode(this.graph, {
      actorUuid: actor.uuid,
      x: point.x - getSetting("nodeSize") / 2,
      y: point.y - getSetting("nodeSize") / 2,
      width: getSetting("nodeSize"),
      height: getSetting("nodeSize"),
      cachedName: actor.name,
      cachedImage: actorTokenImage(actor, getSetting("unknownActorImage"))
    });
    this.graph = result.state;
    this.#presentations.set(result.node.id, { name: actor.name, image: actorTokenImage(actor), missing: false, actor });
    this.selected = { kind: "actor", id: result.node.id };
    this.#renderer.render();
    this.graphChanged();
  }

  select(selection) {
    this.selected = selection;
    this.#renderer?.render();
  }

  refreshAssets() {
    this.#renderer?.render();
  }

  beginInteractiveChange() {
    this.#interactiveBefore = clone(this.graph);
  }

  commitInteractiveChange() {
    if (this.#interactiveBefore) {
      this.#history.push(this.#interactiveBefore);
      if (this.#history.length > 50) this.#history.shift();
      this.#future = [];
    }
    this.#interactiveBefore = null;
    this.graphChanged();
  }

  #recordHistory() {
    this.#history.push(clone(this.graph));
    if (this.#history.length > 50) this.#history.shift();
    this.#future = [];
  }

  graphChanged({ viewportOnly = false } = {}) {
    if (viewportOnly && !this.canManageNodes) return;
    this.#changeSerial += 1;
    this.#dirty = true;
    if (!viewportOnly) this.#renderer?.render();
    this.#updateStatus();
  }

  async save() {
    if (!this.canEdit || !this.#dirty) return;
    if (this.#savePromise) {
      await this.#savePromise;
      return this.#dirty ? this.save() : undefined;
    }
    const promise = this.#performSave();
    this.#savePromise = promise;
    try {
      return await promise;
    } finally {
      if (this.#savePromise === promise) this.#savePromise = null;
    }
  }

  async #performSave() {
    const serial = this.#changeSerial;
    const snapshot = clone(this.graph);
    const localViewport = clone(this.graph.viewport);
    this.#saving = true;
    this.#updateStatus();
    try {
      const saved = await relationGraphStore.save(this.page, snapshot);
      if (serial === this.#changeSerial) {
        this.graph = saved;
        if (!this.canManageNodes) this.graph.viewport = localViewport;
        this.#dirty = false;
        this.#history = [];
        this.#future = [];
      } else {
        this.graph.revision = saved.revision;
        this.#dirty = true;
      }
    } catch (error) {
      ui.notifications.error(i18nError(error));
      logger.warn("Graph save failed", error);
      throw error;
    } finally {
      this.#saving = false;
      this.#updateStatus();
    }
  }

  #updateStatus() {
    const status = this.element?.querySelector?.(".mit-save-status");
    if (status) status.textContent = this.#saving
      ? game.i18n.localize(`${MODULE_ID}.Graph.Saving`)
      : this.#dirty ? game.i18n.localize(`${MODULE_ID}.Graph.Unsaved`) : game.i18n.localize(`${MODULE_ID}.Graph.Saved`);
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
    new CustomNodeEditor({}, node => {
      this.#recordHistory();
      const result = addCustomNode(this.graph, {
        name: node.name,
        image: node.image,
        x: point.x - size / 2,
        y: point.y - size / 2,
        width: size,
        height: size
      });
      this.graph = result.state;
      this.#presentations.set(result.node.id, {
        missing: false,
        name: result.node.nameOverride,
        image: result.node.imageOverride
      });
      this.selected = { kind: "actor", id: result.node.id };
      this.graphChanged();
    }).render({ force: true });
  }

  createFaction() {
    if (!this.canManageNodes) return;
    const rect = this.element.querySelector("[data-relation-graph]").getBoundingClientRect();
    const point = this.#renderer.clientToGraph(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const memberOptions = this.graph.nodes.map(node => ({ id: node.id, name: this.nodePresentation(node.id).name, checked: false }));
    new FactionEditor({
      x: point.x - 250,
      y: point.y - 175,
      memberOptions,
      style: {
        fill: getSetting("factionFill"),
        fillOpacity: getSetting("factionOpacity"),
        stroke: getSetting("factionFill"),
        strokeWidth: 3
      }
    }, faction => {
      this.#recordHistory();
      const result = addFaction(this.graph, faction);
      this.graph = result.state;
      for (const nodeId of faction.memberNodeIds || []) this.graph = setMembership(this.graph, nodeId, result.faction.id, true).state;
      this.selected = { kind: "faction", id: result.faction.id };
      this.graphChanged();
    }).render({ force: true });
  }

  createRelation(sourceId, targetId) {
    if (!this.canManageEdges) return;
    const source = this.entity(sourceId);
    const target = this.entity(targetId);
    if (source?.kind !== "actor" || target?.kind !== "actor") return;
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
      save: edge => {
        this.#recordHistory();
        const { newRelationLabel, ...edgeData } = edge;
        let state = this.graph;
        if (newRelationLabel) state = addRelationLabel(state, newRelationLabel).state;
        const result = addEdge(state, edgeData);
        this.graph = result.state;
        this.selected = { kind: "edge", id: result.edge.id };
        this.graphChanged();
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
    new NodeEditor({ ...clone(node), sourceName, custom: !node.actorUuid }, updated => {
      this.#recordHistory();
      this.graph = updateEntity(this.graph, nodeId, updated).state;
      this.graphChanged();
    }).render({ force: true });
  }

  editFaction(factionId) {
    if (!this.canManageNodes) return;
    const faction = this.entity(factionId);
    const memberOptions = this.graph.nodes.map(node => ({ id: node.id, name: this.nodePresentation(node.id).name, checked: faction.memberNodeIds.includes(node.id) }));
    new FactionEditor({ ...clone(faction), memberOptions }, updated => {
      this.#recordHistory();
      this.graph = updateEntity(this.graph, factionId, updated).state;
      for (const node of this.graph.nodes) this.graph = setMembership(this.graph, node.id, factionId, updated.memberNodeIds.includes(node.id)).state;
      this.graphChanged();
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
      save: updated => {
        this.#recordHistory();
        const { newRelationLabel, ...edgeData } = updated;
        let state = this.graph;
        if (newRelationLabel) state = addRelationLabel(state, newRelationLabel).state;
        Object.assign(state.edges.find(item => item.id === edgeId), edgeData);
        this.graph = normalizeGraph(state);
        this.graphChanged();
      },
      deleteLabel: definition => this.deleteRelationLabel(definition)
    }).render({ force: true });
  }

  deleteRelationLabel(definition) {
    if (!this.canManageEdges) return;
    const result = removeRelationLabel(this.graph, definition);
    if (!result.changed) return;
    this.#recordHistory();
    this.graph = result.state;
    if (this.selected?.kind === "edge" && !this.graph.edges.some(edge => edge.id === this.selected.id)) this.selected = null;
    this.graphChanged();
  }

  addMembershipsAtPosition(nodeId) {
    const node = this.entity(nodeId);
    if (!node) return;
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    for (const faction of this.graph.factions) {
      const inside = centerX >= faction.x && centerX <= faction.x + faction.width && centerY >= faction.y && centerY <= faction.y + faction.height;
      if (inside && !node.factionIds.includes(faction.id)) this.graph = setMembership(this.graph, nodeId, faction.id, true).state;
    }
  }

  deleteSelected() {
    if (!this.selected) return;
    const allowed = this.selected.kind === "edge"
      ? canModifyGraph(game.user, "deleteEdge")
      : this.selected.kind === "actor"
        ? this.canDeleteNodes
        : this.canManageNodes;
    if (!allowed) return;
    this.#recordHistory();
    this.graph = this.selected.kind === "edge"
      ? removeEdge(this.graph, this.selected.id).state
      : removeEntity(this.graph, this.selected.id).state;
    this.selected = null;
    this.graphChanged();
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

  undo() {
    const prior = this.#history.pop();
    if (!prior) return;
    this.#future.push(clone(this.graph));
    const revision = this.graph.revision;
    this.graph = prior;
    this.graph.revision = revision;
    this.selected = null;
    this.graphChanged();
  }

  redo() {
    const next = this.#future.pop();
    if (!next) return;
    this.#history.push(clone(this.graph));
    const revision = this.graph.revision;
    this.graph = next;
    this.graph.revision = revision;
    this.selected = null;
    this.graphChanged();
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
      this.#recordHistory();
      imported.revision = this.graph.revision;
      this.graph = imported;
      await this.#hydrateNodes();
      this.selected = null;
      this.graphChanged();
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
    if (page.uuid !== this.page?.uuid || this.#saving || this.#dirty) return;
    this.graph = normalizeGraph(page.getFlag(MODULE_ID, "relationGraph"));
    await this.#hydrateNodes();
    this.#renderer?.render();
  }

  async sourceActorChanged(actor, deleted = false) {
    if (!this.canManageNodes) return;
    const nodes = this.graph?.nodes?.filter(node => node.actorUuid === actor.uuid) || [];
    if (!nodes.length) return;
    let changed = false;
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
      if (this.canManageNodes && (node.cachedName !== actor.name || node.cachedImage !== image)) {
        changed = true;
        node.cachedName = actor.name;
        node.cachedImage = image;
      }
      this.#presentations.set(node.id, { missing: false, name: actor.name, image, actor });
    }
    this.#renderer?.render();
    if (changed && this.canManageNodes && socketService.isAuthority()) this.graphChanged();
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
