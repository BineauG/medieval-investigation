export const MODULE_ID = "medieval-investigation-toolkit";
export const MODULE_TITLE = "Medieval Investigation Toolkit";
export const LOG_PREFIX = `[${MODULE_TITLE}]`;
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const CARD_SCHEMA_VERSION = 2;
export const BOARD_SCHEMA_VERSION = 2;
export const GRAPH_SCHEMA_VERSION = 4;
export const GRAPH_ID = "main-relation-graph";
export const GRAPH_JOURNAL_FLAG = "relationGraphStore";
export const GRAPH_PAGE_FLAG = "relationGraph";
export const CUSTOM_ASSET_ROOT = `assets/${MODULE_ID}`;
export const PIN_ASSET_DIRECTORY = `${CUSTOM_ASSET_ROOT}/pins`;
export const PARCHMENT_ASSET_DIRECTORY = `${CUSTOM_ASSET_ROOT}/parchments`;
export const NOTE_ASSET_DIRECTORY = `${CUSTOM_ASSET_ROOT}/notes`;

// Stored as an array on each card so additional tags can be introduced later
// without changing the card format again.
export const CARD_TAGS = Object.freeze({ Dead: "dead" });

export const DEFAULT_CARD_SIZE = Object.freeze({ width: 260, height: 320 });
export const DEFAULT_NOTE_SIZE = Object.freeze({ width: 120, height: 320 });
// The original seal size was already multiplied by 1.2. The 1.3.1 visual
// increase adds another 30% for every card type: 1.2 × 1.3 = 1.56.
export const BOARD_PIN_SCALE = 1.56;
export const DEFAULT_CONNECTION_STYLE = Object.freeze({ color: "#7b1010", width: 4, sag: 0.12 });
export const DEFAULT_DEATH_OVERLAY_OPACITY = 0.72;
// Deliberately muted pigments inspired by the WFRP books and UI. Board
// strings are restricted to this palette so every client renders a known,
// readable colour on parchment and dark scenes.
export const STRING_COLORS = Object.freeze({
  Red: "#7b1010",
  Blue: "#28506f",
  Yellow: "#c39a32",
  Green: "#46633b",
  Purple: "#613c69",
  Black: "#1c1917",
  White: "#e8dfc9",
  Gray: "#777269",
  Orange: "#b65d25"
});
export const DEFAULT_NODE_SIZE = Object.freeze({ width: 112, height: 112 });
export const HIDDEN_ACTOR_IMAGE = "systems/wfrp4e/tokens/unknown.png";
export const DEFAULT_EDGE_STYLE = Object.freeze({ color: "#5b1a1a", width: 2, lineStyle: "solid" });
export const DEFEATED_OVERLAY_IMAGE = "systems/wfrp4e/icons/defeated.png";
export const DEFAULT_FACTION_STYLE = Object.freeze({
  fill: "#6b1e1e",
  fillOpacity: 0.12,
  stroke: "#6b1e1e",
  strokeWidth: 3
});

export const AUDIO_DOCUMENT_TYPES = Object.freeze(["Playlist", "PlaylistSound", "AmbientSound"]);
export const AUDIO_EXTENSIONS = Object.freeze(["mp3", "ogg", "wav", "flac", "m4a", "aac", "opus"]);
export const VIDEO_EXTENSIONS = Object.freeze(["mp4", "m4v", "mov", "avi", "mkv", "webm"]);

export const RELATION_PRESETS = Object.freeze([
  Object.freeze({ key: "favorableTo", color: "#2E7D32" }),
  Object.freeze({ key: "opposedTo", color: "#B3261E" }),
  Object.freeze({ key: "benefitsFrom", color: "#B8860B" }),
  Object.freeze({ key: "suffers", color: "#616161" }),
  Object.freeze({ key: "defends", color: "#2E7D32" }),
  Object.freeze({ key: "fights", color: "#B3261E" }),
  Object.freeze({ key: "killed", color: "#B3261E" }),
  Object.freeze({ key: "finances", color: "#B8860B" }),
  Object.freeze({ key: "supports", color: "#2E7D32" }),
  Object.freeze({ key: "influences", color: "#6A1B9A" }),
  Object.freeze({ key: "manipulates", color: "#6A1B9A" }),
  Object.freeze({ key: "controls", color: "#6A1B9A" }),
  Object.freeze({ key: "protects", color: "#2E7D32" }),
  Object.freeze({ key: "serves", color: "#1F1F1F" }),
  Object.freeze({ key: "worksFor", color: "#1F1F1F" }),
  Object.freeze({ key: "memberOf", color: "#1F1F1F" }),
  Object.freeze({ key: "represents", color: "#1F1F1F" }),
  Object.freeze({ key: "watches", color: "#C65D00" }),
  Object.freeze({ key: "investigates", color: "#C65D00" }),
  Object.freeze({ key: "hides", color: "#1F4E79" }),
  Object.freeze({ key: "knowsSecretOf", color: "#1F4E79" }),
  Object.freeze({ key: "dependsOn", color: "#616161" }),
  Object.freeze({ key: "alliedWith", color: "#2E7D32" }),
  Object.freeze({ key: "rivalOf", color: "#B3261E" }),
  Object.freeze({ key: "enemyOf", color: "#B3261E" }),
  Object.freeze({ key: "friend", color: "#2E7D32" }),
  Object.freeze({ key: "marriedTo", color: "#AD1457" }),
  Object.freeze({ key: "lover", color: "#AD1457" }),
  Object.freeze({ key: "parentOf", color: "#6D4C41" })
]);
