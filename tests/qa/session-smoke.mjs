/**
 * Playable-session smoke test.
 * Drives the same SmartFox frames the Flash client sends, with the HTTP login
 * cookie that the Ruffle /ws bridge inherits. Asserts the full path:
 * logOK + player data -> room list -> joinOK + room data.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("../../backend/server/node_modules/ws");

const BASE = process.env.EKOLOKO_BASE_URL || "http://localhost:8080";
const USERNAME = process.env.EKOLOKO_USER || "orimiz";
const PASSWORD = process.env.EKOLOKO_PASSWORD || "Iorimiz11";
const NUL = String.fromCharCode(0);

async function httpLogin() {
  const url = `${BASE}/ekoloko-web/login.action?userName=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!body.includes("login_ok")) throw new Error(`HTTP login failed: ${body}`);
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error("HTTP login did not set the session cookie");
  return cookie.split(";")[0];
}

function send(ws, frame) {
  ws.send(frame + NUL);
}

async function main() {
  const cookie = await httpLogin();
  console.log(`[ok] HTTP login ${USERNAME}`);

  const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws`, { headers: { Cookie: cookie } });
  const received = [];
  const expected = [
    ["verChk", "apiOK"],
    ["getRmList", "rmList"],
    ["joinRoom", "joinOK"],
  ];
  let step = 0;
  let roomId = 1;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${expected[step]?.[1]}`)), 12000);
    ws.on("error", reject);
    ws.on("open", () => {
      send(ws, `<msg t='sys'><body action='verChk' r='0'><ver v='9.1'></ver></body></msg>`);
    });
    ws.on("message", (data) => {
      const text = data.toString();
      received.push(text);
      const action = expected[step]?.[1];
      if (action && !text.includes(`action="${action}"`) && !text.includes(`action='${action}'`)) return;
      if (action === "rmList") {
        const match = text.match(/<rm id=['"](\d+)['"]/);
        if (match) roomId = Number(match[1]);
      }
      console.log(`[ok] received ${action}`);
      step += 1;
      const next = expected[step];
      if (!next) {
        clearTimeout(timer);
        // JoinOK and room data arrive in the same burst; let the trailing
        // extension response land before closing.
        setTimeout(() => {
          ws.close();
          resolve();
        }, 500);
        return;
      }
      const frame =
        next[0] === "getRmList"
          ? `<msg t='sys'><body action='getRmList' r='0'></body></msg>`
          : `<msg t='sys'><body action='joinRoom' r='${roomId}'><room id='${roomId}' /></body></msg>`;
      send(ws, frame);
    });
  });

  const all = received.join("\n");
  for (const [name, token] of [
    ["logOK", "logOK"],
    ["player data", '"21":"23"'],
    ["room list", "rmList"],
    ["joinOK", "joinOK"],
    ["room data", '"21":"2"'],
  ]) {
    if (!all.includes(token)) throw new Error(`missing ${name} in server responses`);
    console.log(`[ok] ${name}`);
  }
  console.log("PASS: playable session established");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
