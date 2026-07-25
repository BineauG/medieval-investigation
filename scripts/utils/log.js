import { LOG_PREFIX, MODULE_ID } from "../constants.js";

function debugging() {
  try {
    return Boolean(globalThis.game?.settings?.get(MODULE_ID, "debugLogging"));
  } catch (_error) {
    return false;
  }
}

export const logger = {
  debug(...args) {
    if (debugging()) console.debug(LOG_PREFIX, ...args);
  },
  info(...args) {
    console.info(LOG_PREFIX, ...args);
  },
  warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  },
  error(...args) {
    console.error(LOG_PREFIX, ...args);
  }
};
