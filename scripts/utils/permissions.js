export function selectAuthority(users = []) {
  return [...users]
    .filter(user => user?.active && user?.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] || null;
}

export function canModifyBoard(user, action, _card, _settings = {}) {
  if (user?.isGM) return true;
  if (!user?.active) return false;
  // Player operations are executed immediately by the active GM authority.
  // The controller still applies field-level validation to card and string
  // editors, while card deletion and source-document creation remain GM-only.
  if (action === "createCard") return _card?.cardType === "free";
  return action === "updateCard"
    || action === "moveCard"
    || action === "createConnection"
    || action === "updateConnection"
    || action === "deleteConnection";
}

const PLAYER_GRAPH_ACTIONS = new Set([
  "deleteNode",
  "moveNode",
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
