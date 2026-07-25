export function selectAuthority(users = []) {
  return [...users]
    .filter(user => user?.active && user?.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] || null;
}

export function canModifyBoard(user, action, _card, _settings = {}) {
  if (user?.isGM) return true;
  if (!user?.active) return false;
  // Players have exactly two shared mutations: the restricted card fields and
  // the style of an existing string. Field-level validation is performed by
  // the board controller on the authoritative GM client.
  return action === "updateCard" || action === "updateConnection";
}

const PLAYER_GRAPH_ACTIONS = new Set([
  "save",
  "deleteNode",
  "createEdge",
  "updateEdge",
  "deleteEdge"
]);

export function canModifyGraph(user, action = "save") {
  if (user?.isGM) return true;
  if (!user?.active) return false;
  return PLAYER_GRAPH_ACTIONS.has(action);
}

export function settingsSnapshot(getter) {
  return {
    anonymizeUnauthorized: Boolean(getter("anonymizeUnauthorized"))
  };
}
