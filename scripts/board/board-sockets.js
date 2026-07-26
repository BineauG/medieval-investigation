import { MODULE_ID, SOCKET_NAME } from "../constants.js";
import { selectAuthority } from "../utils/permissions.js";
import { randomId } from "../utils/ids.js";
import { logger } from "../utils/log.js";

const ALLOWED_OPERATIONS = new Set([
  "board.createCard",
  "board.updateCard",
  "board.moveCard",
  "board.deleteCard",
  "board.createConnection",
  "board.updateConnection",
  "board.deleteConnection",
  "graph.save"
]);

export class SocketService {
  #pending = new Map();
  #handler = null;
  #queue = Promise.resolve();

  register(handler) {
    this.#handler = handler;
    game.socket.on(SOCKET_NAME, packet => this.#onPacket(packet));
  }

  authority() {
    return selectAuthority(game.users?.contents || [...(game.users || [])]);
  }

  isAuthority() {
    return this.authority()?.id === game.user.id;
  }

  #enqueue(task) {
    const run = this.#queue.then(task, task);
    // Keep the queue usable after a rejected local operation while returning
    // the real result or error to that operation's caller.
    this.#queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async request(operation, payload) {
    if (!ALLOWED_OPERATIONS.has(operation)) throw new TypeError("Unsupported socket operation");
    const authority = this.authority();
    if (!authority) throw new Error("Errors.NoActiveGM");
    // Local MJ actions and remote player requests share the same authority
    // queue. No manual confirmation is involved; accepted operations execute
    // immediately and in deterministic arrival order.
    if (authority.id === game.user.id) return this.#enqueue(() => this.#handler(operation, payload, game.user));

    const requestId = randomId();
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error("Errors.RequestTimeout"));
      }, 15_000);
      this.#pending.set(requestId, { resolve, reject, timer });
      game.socket.emit(SOCKET_NAME, {
        type: "request",
        moduleId: MODULE_ID,
        requestId,
        userId: game.user.id,
        authorityId: authority.id,
        operation,
        payload
      });
    });
  }

  #onPacket(packet) {
    if (!packet || packet.moduleId !== MODULE_ID) return;
    if (packet.type === "response" && packet.userId === game.user.id) {
      const pending = this.#pending.get(packet.requestId);
      if (!pending) return;
      globalThis.clearTimeout(pending.timer);
      this.#pending.delete(packet.requestId);
      if (packet.ok) pending.resolve(packet.result);
      else pending.reject(new Error(packet.error || "Errors.RequestRejected"));
      return;
    }
    if (packet.type !== "request" || packet.authorityId !== game.user.id || !this.isAuthority()) return;
    void this.#enqueue(() => this.#handleRequest(packet)).catch(error => logger.error(error));
  }

  async #handleRequest(packet) {
    const user = game.users?.get(packet.userId);
    let response;
    if (!user?.active || !ALLOWED_OPERATIONS.has(packet.operation)) {
      response = { ok: false, error: "Errors.RequestRejected" };
    } else {
      try {
        const result = await this.#handler(packet.operation, packet.payload, user);
        response = { ok: true, result };
      } catch (error) {
        logger.warn("Socket request rejected", packet.operation, packet.userId, error);
        response = { ok: false, error: error.message || "Errors.RequestRejected" };
      }
    }
    game.socket.emit(SOCKET_NAME, {
      type: "response",
      moduleId: MODULE_ID,
      requestId: packet.requestId,
      userId: packet.userId,
      ...response
    });
  }
}

export const socketService = new SocketService();
