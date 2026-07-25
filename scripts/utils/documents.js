import { AUDIO_DOCUMENT_TYPES, AUDIO_EXTENSIONS, MODULE_ID, VIDEO_EXTENSIONS } from "../constants.js";

function extension(path = "") {
  return String(path).split(/[?#]/u)[0].split(".").pop()?.toLowerCase() || "";
}

export function isAudioReference(reference = {}) {
  const documentType = reference.documentName || reference.type || reference.sourceType || "";
  const mime = reference.mimeType || reference.mime || "";
  const path = reference.path || reference.src || reference.url || reference.image || "";
  return AUDIO_DOCUMENT_TYPES.includes(documentType)
    || String(mime).toLowerCase().startsWith("audio/")
    || AUDIO_EXTENSIONS.includes(extension(path));
}

export function isVideoReference(reference = {}) {
  const mime = reference.mimeType || reference.mime || "";
  const path = reference.path || reference.src || reference.url || reference.image || "";
  return String(mime).toLowerCase().startsWith("video/") || VIDEO_EXTENSIONS.includes(extension(path));
}

export async function resolveUuid(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  try {
    return await globalThis.fromUuid(uuid);
  } catch (_error) {
    return null;
  }
}

export function actorTokenImage(actor, fallback = `modules/${MODULE_ID}/assets/unknown-person.svg`) {
  return actor?.prototypeToken?.texture?.src || actor?.img || fallback;
}

export function documentImage(document, fallback = `modules/${MODULE_ID}/assets/document.svg`) {
  if (!document) return fallback;
  if (document.documentName === "JournalEntryPage" && document.type === "image") {
    return document.src || document.image?.src || fallback;
  }
  return document.img || document.texture?.src || document.icon || fallback;
}

export function shortDocumentText(document, maximum = 240) {
  const content = document?.text?.content || document?.content || "";
  if (!content || typeof content !== "string") return "";
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&(?:amp|#38);/giu, "&")
    .replace(/&(?:lt|#60);/giu, "<")
    .replace(/&(?:gt|#62);/giu, ">")
    .replace(/&(?:quot|#34);/giu, '"')
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

export function canViewDocument(document, user = globalThis.game?.user) {
  if (!document || !user) return false;
  if (user.isGM) return true;
  try {
    return Boolean(document.testUserPermission?.(user, "OBSERVER"));
  } catch (_error) {
    return Boolean(document.visible);
  }
}

export async function sourcePresentation(card, { user = globalThis.game?.user, anonymize = true } = {}) {
  const source = await resolveUuid(card?.sourceUuid);
  const allowed = canViewDocument(source, user);
  if (!source) return { source: null, missing: true, allowed: false, name: "", image: "", text: "" };
  if (!allowed && anonymize) return { source, missing: false, allowed: false, name: "", image: "", text: "" };
  return {
    source,
    missing: false,
    allowed,
    name: source.name || "",
    image: documentImage(source),
    text: shortDocumentText(source)
  };
}
