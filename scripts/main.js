import { MODULE_ID, MODULE_TITLE } from "./constants.js";
import { ensureCustomAssetDirectories, registerSettings } from "./settings.js";
import { registerBoardHooks } from "./board/board-tools.js";
import { boardController } from "./board/board-controller.js";
import { socketService } from "./board/board-sockets.js";
import { relationGraphStore } from "./graph/relation-graph-store.js";
import { createApi } from "./api.js";
import { logger } from "./utils/log.js";
import { installBoardDrawingClass } from "./board/board-drawing.js";

Hooks.once("init", () => {
  registerSettings();
  installBoardDrawingClass();
  registerBoardHooks();
  logger.info(`${MODULE_TITLE} initialized`);
});

// Re-apply during setup in case another active module replaced the Drawing
// class later in the init phase. The installer composes with the current class.
Hooks.once("setup", () => installBoardDrawingClass());

Hooks.once("ready", () => {
  ensureCustomAssetDirectories().catch(error => logger.warn("Unable to prepare custom asset directories", error));
  socketService.register(async (operation, payload, user) => {
    if (operation.startsWith("board.")) return boardController.handleOperation(operation, payload, user);
    if (operation.startsWith("graph.")) return relationGraphStore.handleOperation(operation, payload, user);
    throw new Error("Errors.RequestRejected");
  });
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = createApi();
});
