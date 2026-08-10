import { GRAPH_JOURNAL_FLAG, GRAPH_PAGE_FLAG, MODULE_ID } from "../constants.js";
import { createEmptyGraph } from "./relation-graph-data.js";
import { migrateGraph } from "../utils/migrations.js";
import { applyGraphMutation, assertGraphMutationPermission } from "./relation-graph-mutations.js";
import { socketService } from "../board/board-sockets.js";
import { logger } from "../utils/log.js";

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

  async mutate(page, mutation) {
    return socketService.request("graph.mutate", {
      pageUuid: page?.uuid,
      mutation
    });
  }

  async handleOperation(operation, payload, user) {
    if (operation !== "graph.mutate") return undefined;
    const page = await fromUuid(payload?.pageUuid);
    if (!page || page.documentName !== "JournalEntryPage" || !page.getFlag(MODULE_ID, GRAPH_PAGE_FLAG)) {
      throw new Error("Errors.GraphMissing");
    }
    const current = migrateGraph(page.getFlag(MODULE_ID, GRAPH_PAGE_FLAG));
    assertGraphMutationPermission(user, current, payload?.mutation);
    const applied = applyGraphMutation(current, payload?.mutation);
    const next = applied.graph;
    next.revision = current.revision + 1;
    await page.setFlag(MODULE_ID, GRAPH_PAGE_FLAG, next);
    return { graph: next, result: applied.result };
  }
}

export const relationGraphStore = new RelationGraphStore();
