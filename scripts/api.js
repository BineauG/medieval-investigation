import { boardController } from "./board/board-controller.js";
import { openRelationGraph } from "./graph/relation-graph-app.js";
import { relationGraphStore } from "./graph/relation-graph-store.js";

export function createApi() {
  return Object.freeze({
    setBoardEnabled: (scene = canvas.scene, enabled = true) => boardController.setEnabled(scene, enabled),
    toggleBoard: (scene = canvas.scene) => boardController.toggle(scene),
    createCard: (card, position, scene = canvas.scene) => boardController.createCard(card, position, scene),
    createConnection: (sourceCardId, targetCardId, style, scene = canvas.scene) => boardController.createConnection(sourceCardId, targetCardId, style, scene),
    deleteConnection: (connectionId, scene = canvas.scene) => boardController.deleteConnection(connectionId, scene),
    openRelationGraph,
    async getActiveGraph() {
      const { graph } = await relationGraphStore.load();
      return structuredClone(graph);
    }
  });
}
