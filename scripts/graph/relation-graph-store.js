import { GRAPH_JOURNAL_FLAG, GRAPH_PAGE_FLAG, MODULE_ID } from "../constants.js";
import { createEmptyGraph, normalizeGraph, validateGraph } from "./relation-graph-data.js";
import { migrateGraph } from "../utils/migrations.js";
import { canModifyGraph } from "../utils/permissions.js";
import { socketService } from "../board/board-sockets.js";
import { logger } from "../utils/log.js";

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergePlayerGraphChanges(currentInput, proposedInput) {
  const current = migrateGraph(currentInput);
  const proposed = migrateGraph(proposedInput);
  const currentNodes = new Map(current.nodes.map(node => [node.id, node]));
  const proposedNodeIds = new Set(proposed.nodes.map(node => node.id));
  const deletedNodeIds = new Set(current.nodes.filter(node => !proposedNodeIds.has(node.id)).map(node => node.id));
  const expectedNodes = current.nodes.filter(node => !deletedNodeIds.has(node.id));
  if (!equal(proposed.nodes, expectedNodes)) throw new Error("Errors.PermissionDenied");

  const expectedFactions = current.factions.map(faction => ({
    ...faction,
    memberNodeIds: faction.memberNodeIds.filter(nodeId => !deletedNodeIds.has(nodeId))
  }));
  if (!equal(proposed.factions, expectedFactions)) throw new Error("Errors.PermissionDenied");
  if (proposed.nodes.some(node => !currentNodes.has(node.id))) throw new Error("Errors.PermissionDenied");

  return normalizeGraph({
    ...current,
    nodes: proposed.nodes,
    factions: expectedFactions,
    edges: proposed.edges,
    relationLabels: proposed.relationLabels,
    disabledRelationPresetKeys: proposed.disabledRelationPresetKeys,
    viewport: current.viewport,
    name: current.name,
    id: current.id,
    revision: current.revision
  });
}

export class RelationGraphStore {
  findPage() {
    const journal = [...(game.journal || [])].find(entry => entry.getFlag?.(MODULE_ID, GRAPH_JOURNAL_FLAG));
    return journal?.pages?.find(page => page.getFlag?.(MODULE_ID, GRAPH_PAGE_FLAG)) || null;
  }

  async ensurePage() {
    const existing = this.findPage();
    if (existing) return existing;
    if (!game.user.isGM) throw new Error("Errors.GraphNotCreated");
    const JournalEntry = foundry.documents.JournalEntry;
    const journal = await JournalEntry.create({
      name: game.i18n.localize(`${MODULE_ID}.Graph.StorageJournalName`),
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      flags: { [MODULE_ID]: { [GRAPH_JOURNAL_FLAG]: true } }
    });
    const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name: game.i18n.localize(`${MODULE_ID}.Graph.DefaultName`),
      type: "text",
      text: { content: "", format: 1 },
      flags: { [MODULE_ID]: { [GRAPH_PAGE_FLAG]: createEmptyGraph({ name: game.i18n.localize(`${MODULE_ID}.Graph.DefaultName`) }) } }
    }]);
    return page;
  }

  async load() {
    const page = await this.ensurePage();
    const raw = page.getFlag(MODULE_ID, GRAPH_PAGE_FLAG);
    try {
      const graph = migrateGraph(raw || {});
      if (game.user.isGM && JSON.stringify(graph) !== JSON.stringify(raw)) {
        await page.setFlag(MODULE_ID, GRAPH_PAGE_FLAG, graph);
      }
      return { page, graph };
    } catch (error) {
      logger.error("Corrupt relation graph", error);
      ui.notifications.error(game.i18n.localize(`${MODULE_ID}.Errors.CorruptGraph`));
      return { page, graph: createEmptyGraph({ name: game.i18n.localize(`${MODULE_ID}.Graph.DefaultName`) }), corrupt: true };
    }
  }

  async save(page, graph) {
    return socketService.request("graph.save", {
      pageUuid: page?.uuid,
      expectedRevision: Number(graph?.revision || 0),
      graph
    });
  }

  async handleOperation(operation, payload, user) {
    if (operation !== "graph.save") return undefined;
    if (!canModifyGraph(user, "save")) throw new Error("Errors.PermissionDenied");
    const page = await fromUuid(payload?.pageUuid);
    if (!page || page.documentName !== "JournalEntryPage" || !page.getFlag(MODULE_ID, GRAPH_PAGE_FLAG)) {
      throw new Error("Errors.GraphMissing");
    }
    const result = validateGraph(payload.graph);
    if (!result.valid) throw new Error("Errors.InvalidGraph");
    const current = migrateGraph(page.getFlag(MODULE_ID, GRAPH_PAGE_FLAG));
    if (Number(payload.expectedRevision) !== Number(current.revision)) throw new Error("Errors.GraphConflict");
    const next = user.isGM ? result.value : mergePlayerGraphChanges(current, result.value);
    next.revision = current.revision + 1;
    await page.setFlag(MODULE_ID, GRAPH_PAGE_FLAG, next);
    return next;
  }
}

export const relationGraphStore = new RelationGraphStore();
