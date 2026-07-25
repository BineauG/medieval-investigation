import { MODULE_ID } from "../constants.js";
import { createCardData } from "./board-data.js";
import { documentImage, isAudioReference, isVideoReference, resolveUuid } from "../utils/documents.js";

export async function cardFromDrop(data = {}) {
  if (isAudioReference(data)) throw new Error("Errors.AudioUnsupported");
  if (isVideoReference(data)) throw new Error("Errors.VideoUnsupported");
  const uuid = data.uuid || (data.type && data.id ? `${data.type}.${data.id}` : "");
  const document = await resolveUuid(uuid);
  if (!document) throw new Error("Errors.InvalidUuid");
  if (isAudioReference(document)) throw new Error("Errors.AudioUnsupported");
  if (isVideoReference(document)) throw new Error("Errors.VideoUnsupported");
  if (document.documentName === "Actor") {
    return createCardData({ cardType: "actor", sourceUuid: document.uuid, sourceType: "Actor" });
  }
  return createCardData({
    cardType: "document",
    sourceUuid: document.uuid,
    sourceType: document.documentName,
    // Objects created from a directory or an Actor inventory use the Item's
    // own artwork as the document card surface.
    imageOverride: document.documentName === "Item" ? documentImage(document, "") : ""
  });
}

export async function cardPresentation(card, source) {
  const missing = Boolean(card.sourceUuid && !source);
  const isActor = card.cardType === "actor";
  return {
    title: card.titleOverride || source?.name || (missing ? game.i18n.localize(`${MODULE_ID}.Labels.MissingReference`) : ""),
    image: card.imageOverride || documentImage(source, isActor
      ? `modules/${MODULE_ID}/assets/unknown-person.svg`
      : `modules/${MODULE_ID}/assets/document.svg`),
    missing
  };
}
