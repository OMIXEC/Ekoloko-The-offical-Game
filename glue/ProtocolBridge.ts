/**
 * ProtocolBridge — connects the preserved SmartFox stack to the live server.
 *
 * The upstream snapshot ships SocketServer, SmartFoxProtocol, ClientSession,
 * ServerState and ExtensionRouter but the old entrypoint bypassed all of them
 * with a hand-rolled ten-command handler. This module wires the real pieces
 * so a browser client can log in, list rooms, join a room and receive player
 * data from the preserved extension handlers.
 */
import * as fs from "fs";
import md5 from "md5";
import { SocketServer } from "./SocketServer";
import type { ClientSession } from "./ClientSession";
import type { Database } from "../database/Database";
import type { ServerState } from "../game/ServerState";
import type { ExtensionRouter } from "../extensions/ExtensionRouter";
import * as C from "../game/Constants";
import { verifySession } from "../http/SessionToken";
import {
  apiOK,
  logOK,
  logKO,
  roomList,
  joinOK,
  joinKO,
  uCount,
  userEnterRoom,
  userGone,
  uVarsUpdate,
  pubMsg,
  roundTripResponse,
  type SFSMessage,
  type SysMessage,
  type ExtMessage,
  type RoomDescriptor,
  type UserDescriptor,
} from "./SmartFoxProtocol";

const CAPTURE_FILE = "/tmp/ekoloko-frames.log";

function capture(direction: string, payload: string): void {
  if (process.env.EKOLOKO_CAPTURE_FRAMES !== "1") return;
  try {
    fs.appendFileSync(CAPTURE_FILE, `${Date.now()} ${direction} ${payload}\n`);
  } catch {
    // Capture is best-effort; never break the game for a logging failure.
  }
}

function descriptor(session: ClientSession, user: ClientSession): UserDescriptor {
  return {
    id: user.userId,
    name: user.username,
    isModerator: user.isModerator,
    isSpectator: false,
    playerId: user.userId,
    vars: Object.fromEntries(user.userVariables),
  };
}

function sendRoomList(session: ClientSession, db: Database): void {
  const rows = db.all<{ id: number; name: string; max_users: number }>(
    "SELECT id, name, max_users FROM rooms ORDER BY id ASC"
  );
  const rooms: RoomDescriptor[] = rows.map((row) => ({
    id: row.id,
    name: row.name || String(row.id),
    maxUsers: row.max_users || 100,
    maxSpectators: 0,
    isTemp: false,
    isGame: false,
    isPrivate: false,
    userCount: 0,
    spectatorCount: 0,
    vars: {},
  }));
  session.send(roomList(rooms));
  capture("S->C", `rmList rooms=${rooms.length}`);
}

function authenticate(
  session: ClientSession,
  db: Database,
  state: ServerState,
  nick: string,
  password: string,
  trusted = false
): boolean {
  const account = db.getAccountByUsername(nick);
  if (!account) {
    session.send(logKO("User not found"));
    return false;
  }
  if (!trusted) {
    const hash = md5(password);
    if (account.password_hash !== hash && account.password_hash !== password) {
      session.send(logKO("Invalid password"));
      return false;
    }
  }
  session.userId = Number(account.id);
  session.username = String(account.username);
  session.isLoggedIn = true;
  session.isModerator = Number(account.mod_level ?? 0) > 0;
  session.isRanger = Number(account.ranger_level ?? 0) > 0;
  // LoginExtension owns duplicate-session eviction and state.registerUser.
  // Registering here too would make the extension kick this very session.

  const player = db.getPlayerData(session.userId);
  session.userVariables.set("look", String(player?.skin_tone ?? "1"));
  session.userVariables.set("x", 0);
  session.userVariables.set("y", 0);

  session.send(logOK(session.userId, session.username, session.isModerator));
  capture("S->C", `logOK ${session.username}`);

  // The preserved LoginExtension builds the full numeric-key player packet
  // (inventory, quests, buddies, animals, house, cards, potions).
  routerForSession.handleMessage(
    session,
    JSON.stringify({
      t: "xt",
      b: {
        x: C.EXT_LOGIN,
        c: "login",
        r: -1,
        // Trusted cookie auth has no plaintext password; LoginExtension
        // accepts the stored hash directly as its fallback comparison.
        p: { username: nick, password: trusted ? String(account.password_hash) : password },
      },
    })
  );
  return true;
}

// ExtensionRouter is injected per server instance; assigned in startProtocolBridge.
let routerForSession: ExtensionRouter;

function handleSystem(
  session: ClientSession,
  message: SysMessage,
  db: Database,
  state: ServerState
): void {
  capture("C->S", `<${message.action}> ${JSON.stringify(message.data)}`);

  switch (message.action) {
    case "verChk":
      session.send(apiOK());
      return;

    case "rndK":
      session.send(
        `<msg t='sys'><body action='rndK' r='-1'><k>${Math.random().toString(36).slice(2, 14)}</k></body></msg>`
      );
      return;

    case "sessionUser": {
      // Internal message injected by /ws after a signed HTTP login cookie.
      // Never trust it without verifying the HMAC.
      const match = message.bodyXml.match(/<user\s+n='([^']+)'\s+k='([^']+)'/);
      if (!match || verifySession(match[2]) !== match[1]) {
        console.warn("[SFS] Rejected untrusted sessionUser message");
        return;
      }
      console.log("[SFS] Trusted socket identity:", match[1]);
      authenticate(session, db, state, match[1], "", true);
      return;
    }

    case "login": {
      const nick = String(message.data.nick ?? "").trim();
      const password = String(message.data.password ?? "");
      if (!nick) {
        session.send(logKO("Missing username"));
        return;
      }
      // The socket may already be authenticated by the HTTP cookie bridge.
      if (session.isLoggedIn && session.username.toLowerCase() === nick.toLowerCase()) {
        session.send(logOK(session.userId, session.username, session.isModerator));
        sendRoomList(session, db);
        return;
      }
      if (authenticate(session, db, state, nick, password)) {
        sendRoomList(session, db);
      }
      return;
    }

    case "zInfo":
    case "getRmList":
      session.send(apiOK());
      if (session.isLoggedIn) {
        session.send(logOK(session.userId, session.username, session.isModerator));
      }
      sendRoomList(session, db);
      return;

    case "joinRoom":
    case "autoJoin": {
      if (!session.isLoggedIn) {
        session.send(joinKO(Number(message.data.roomId ?? 1) || 1, "Not logged in"));
        return;
      }
      const wanted = Number(message.data.roomId ?? -1);
      const roomId = wanted > 0 ? wanted : 1;
      const room = db.getRoomData(roomId);
      if (!room) {
        session.send(joinKO(roomId, "Room not found"));
        return;
      }

      const previous = session.roomId;
      if (previous >= 0 && previous !== roomId) {
        state.leaveRoom(session.sessionId);
        for (const peer of state.getRoomSessions(previous)) {
          peer.send(userGone(previous, session.userId));
          peer.send(uCount(previous, state.getRoomUserCount(previous), 0));
        }
      }

      state.joinRoom(session.sessionId, roomId);
      db.updatePlayerLastRoom(session.userId, roomId);

      const occupants = state.getRoomSessions(roomId);
      session.send(joinOK(roomId, String(room.name || roomId), occupants.map((u) => descriptor(session, u))));
      session.send(uCount(roomId, occupants.length, 0));
      capture("S->C", `joinOK room=${roomId} users=${occupants.length}`);

      for (const peer of occupants) {
        if (peer.sessionId === session.sessionId) continue;
        peer.send(userEnterRoom(roomId, descriptor(peer, session)));
        peer.send(uCount(roomId, state.getRoomUserCount(roomId), 0));
      }

      // Room data comes from the preserved RoomExtension (numeric keys).
      routerForSession.handleMessage(
        session,
        JSON.stringify({
          t: "xt",
          b: { x: C.EXT_ROOM, c: C.C_GET_ROOM, r: roomId, p: { roomId } },
        })
      );
      return;
    }

    case "setUvars": {
      const vars = (message.data.vars ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(vars)) {
        session.userVariables.set(key, value);
      }
      if (session.roomId > 0 && Object.keys(vars).length > 0) {
        for (const peer of state.getRoomSessions(session.roomId)) {
          peer.send(uVarsUpdate(session.roomId, session.userId, vars));
        }
      }
      return;
    }

    case "pubMsg": {
      if (session.isLoggedIn && session.roomId > 0) {
        state.broadcastToRoom(
          session.roomId,
          pubMsg(session.roomId, session.userId, String(message.data.text ?? ""))
        );
      }
      return;
    }

    case "loadB":
      session.send("<msg t='sys'><body action='bList' r='0'><mv></mv><bList></bList></body></msg>");
      return;

    case "roundTrip":
    case "roundTripBench":
      session.send(roundTripResponse());
      return;

    case "logout":
      if (session.roomId > 0) {
        const oldRoom = session.roomId;
        state.leaveRoom(session.sessionId);
        for (const peer of state.getRoomSessions(oldRoom)) {
          peer.send(userGone(oldRoom, session.userId));
          peer.send(uCount(oldRoom, state.getRoomUserCount(oldRoom), 0));
        }
      }
      state.removeSession(session.sessionId);
      session.isLoggedIn = false;
      session.userId = -1;
      session.username = "";
      return;

    default:
      console.warn("[SFS] Unhandled sys action:", message.action, JSON.stringify(message.data));
  }
}

export async function startProtocolBridge(
  db: Database,
  state: ServerState,
  router: ExtensionRouter,
  port: number
): Promise<SocketServer> {
  routerForSession = router;
  const tcp = new SocketServer({ port, host: "0.0.0.0" });

  tcp.onConnect((session) => {
    state.addSession(session);
    console.log(`[SFS] Connected ${session.sessionId.slice(0, 8)}`);
  });

  tcp.on("parseError", (raw: string, session: ClientSession) => {
    console.warn("[SFS] Parse error from", session.sessionId.slice(0, 8), JSON.stringify(raw));
  });

  tcp.onMessage((session: ClientSession, message: SFSMessage) => {
    if (message.type === "xt") {
      const ext = message as ExtMessage;
      capture("C->S", `xt ${ext.extension}/${ext.command}`);
      router.handleMessage(
        session,
        JSON.stringify({
          t: "xt",
          b: {
            x: ext.extension,
            c: ext.command,
            r: ext.roomId,
            p: ext.params,
          },
        })
      );
      return;
    }
    handleSystem(session, message as SysMessage, db, state);
  });

  tcp.onDisconnect((session) => {
    if (session.roomId > 0) {
      const oldRoom = session.roomId;
      for (const peer of state.getRoomSessions(oldRoom)) {
        peer.send(userGone(oldRoom, session.userId));
        peer.send(uCount(oldRoom, state.getRoomUserCount(oldRoom), 0));
      }
    }
    router.handleDisconnect(session);
    state.removeSession(session.sessionId);
    console.log(`[SFS] Disconnected ${session.sessionId.slice(0, 8)}`);
  });

  await tcp.start();
  console.log(`[SFS] SmartFox stack listening on tcp://0.0.0.0:${port}`);
  return tcp;
}
