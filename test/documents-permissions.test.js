import test from "node:test";
import assert from "node:assert/strict";
import {
  actorTokenImage,
  isAudioReference,
  isVideoReference,
  resolveUuid
} from "../scripts/utils/documents.js";
import { canModifyBoard, canModifyGraph, selectAuthority } from "../scripts/utils/permissions.js";
import { cardFromDrop } from "../scripts/board/card-factory.js";

test("audio documents, MIME types, and extensions are rejected", () => {
  assert.equal(isAudioReference({ documentName: "Playlist" }), true);
  assert.equal(isAudioReference({ mimeType: "audio/ogg" }), true);
  assert.equal(isAudioReference({ path: "evidence.FLAC?x=1" }), true);
  assert.equal(isAudioReference({ path: "portrait.webp" }), false);
});

test("video references are detected separately", () => {
  assert.equal(isVideoReference({ mimeType: "video/mp4" }), true);
  assert.equal(isVideoReference({ path: "clip.webm" }), true);
  assert.equal(isAudioReference({ path: "clip.webm" }), false);
});

test("prototype token image wins, then actor image, then fallback", () => {
  assert.equal(actorTokenImage({ prototypeToken: { texture: { src: "token.webp" } }, img: "actor.webp" }), "token.webp");
  assert.equal(actorTokenImage({ img: "actor.webp" }), "actor.webp");
  assert.equal(actorTokenImage({}, "fallback.svg"), "fallback.svg");
});

test("an Item dropped from a directory or Actor inventory becomes an image document card", async () => {
  const item = {
    id: "sword",
    uuid: "Actor.hero.Item.sword",
    documentName: "Item",
    img: "icons/sword.webp"
  };
  globalThis.fromUuid = async uuid => uuid === item.uuid ? item : null;
  const card = await cardFromDrop({ uuid: item.uuid, type: "Item", id: item.id });
  assert.equal(card.cardType, "document");
  assert.equal(card.sourceUuid, item.uuid);
  assert.equal(card.imageOverride, item.img);
  assert.equal(card.showImage, true);
});

test("UUID resolution returns null on invalid references", async () => {
  globalThis.fromUuid = async uuid => uuid === "Actor.ok" ? { uuid } : Promise.reject(new Error("bad"));
  assert.deepEqual(await resolveUuid("Actor.ok"), { uuid: "Actor.ok" });
  assert.equal(await resolveUuid("Actor.bad"), null);
  assert.equal(await resolveUuid(""), null);
});

test("authority selection is deterministic", () => {
  const authority = selectAuthority([{ id: "z", isGM: true, active: true }, { id: "a", isGM: true, active: true }, { id: "0", isGM: false, active: true }]);
  assert.equal(authority.id, "a");
});

test("players can only edit shared card fields and existing strings", () => {
  const player = { id: "p1", active: true, isGM: false };
  const inactive = { id: "p2", active: false, isGM: false };
  const gm = { id: "gm", active: true, isGM: true };
  assert.equal(canModifyBoard(gm, "deleteCard", {}, {}), true);
  assert.equal(canModifyBoard(player, "createCard"), false);
  assert.equal(canModifyBoard(player, "updateCard"), true);
  assert.equal(canModifyBoard(player, "updateConnection"), true);
  assert.equal(canModifyBoard(player, "deleteCard"), false);
  assert.equal(canModifyBoard(player, "deleteConnection"), false);
  assert.equal(canModifyBoard(inactive, "updateCard"), false);
  assert.equal(canModifyGraph(player, "save"), true);
  assert.equal(canModifyGraph(player, "deleteNode"), true);
  assert.equal(canModifyGraph(player, "createEdge"), true);
  assert.equal(canModifyGraph(player, "updateEdge"), true);
  assert.equal(canModifyGraph(player, "deleteEdge"), true);
  assert.equal(canModifyGraph(player, "moveNode"), false);
  assert.equal(canModifyGraph(player, "updateNode"), false);
  assert.equal(canModifyGraph(inactive, "updateEdge"), false);
  assert.equal(canModifyGraph(gm), true);
});
