const { test, expect, request } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
const CLI = path.join(ROOT, "admin", "cli.js");
const USER = process.env.EKOLOKO_USER || "orimiz";
const PASSWORD = process.env.EKOLOKO_PASSWORD || "Iorimiz11";

function adminCli(args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ADMIN_ACTOR: "playwright" },
  });
}

test("registration creates an account that can log in", async ({ request: api }) => {
  const username = `qa_${Date.now()}`;
  const password = "Qa12345";

  const created = await api.post("/ekoloko-web/register.action", {
    form: { username, password, email: `${username}@ekoloko.local`, gender: "male" },
  });
  expect(created.ok()).toBeTruthy();
  expect((await created.json()).success).toBe(true);

  const login = await api.get("/ekoloko-web/login.action", {
    params: { userName: username, password },
  });
  expect(await login.text()).toContain("login_ok");

  const bad = await api.get("/ekoloko-web/login.action", {
    params: { userName: username, password: "wrong" },
  });
  expect(await bad.text()).toContain("bad_user_password");
});

test("login opens a SmartFox session and joins a room from the browser", async ({ page, request: api }) => {
  // Real HTTP login sets the signed cookie that the /ws bridge inherits.
  const login = await api.get("/ekoloko-web/login.action", {
    params: { userName: USER, password: PASSWORD },
  });
  expect(await login.text()).toContain("login_ok");
  const setCookie = login.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  const value = setCookie.split(";")[0].split("=")[1];
  await page.context().addCookies([
    { name: "ekoloko_user", value, url: "http://localhost:8080" },
  ]);

  // The launcher renders the self-hosted Ruffle build through Chromium.
  await page.goto("/launcher.html");
  await expect(page.locator("h1")).toContainText("Ekoloko");
  await expect(page.locator("script[src*='ruffle-loader.js']")).toHaveCount(1);

  // Drive the same browser WebSocket path Ruffle's socketProxy uses. This
  // avoids headless CDP typing into the Flash form, which is unreliable.
  const result = await page.evaluate(async () => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.binaryType = "arraybuffer";
    const received = [];
    const NUL = String.fromCharCode(0);
    const send = (frame) => ws.send(frame + NUL);
    const decode = (data) =>
      typeof data === "string" ? data : new TextDecoder().decode(new Uint8Array(data));
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("socket timeout: " + received.join("|"))), 15000);
      ws.onopen = () => send("<msg t='sys'><body action='verChk' r='0'><ver v='9.1'></ver></body></msg>");
      ws.onerror = () => reject(new Error("socket error"));
      ws.onmessage = (event) => {
        const text = decode(event.data);
        received.push(text);
        const all = received.join("\n");
        if (all.includes("joinOK") && all.includes('"21":"2"')) {
          clearTimeout(timer);
          ws.close();
          resolve(all);
          return;
        }
        if (text.includes("apiOK") && !all.includes("rmList")) {
          send("<msg t='sys'><body action='getRmList' r='0'></body></msg>");
        } else if (text.includes("rmList") && !all.includes("joinOK")) {
          const m = text.match(/<rm id=['"](\d+)['"]/);
          const room = m ? m[1] : "101";
          send(`<msg t='sys'><body action='joinRoom' r='${room}'><room id='${room}' /></body></msg>`);
        }
      };
    });
  });

  expect(result).toContain("logOK");
  expect(result).toContain('"21":"23"');
  expect(result).toContain("rmList");
  expect(result).toContain("joinOK");
  expect(result).toContain('"21":"2"');
});

test("gift card redemption works once and is single-use", async ({ request: api }) => {
  const before = JSON.parse(adminCli(["user:show", "--user", USER]));
  const coinsBefore = before.account.coins;

  const created = JSON.parse(
    adminCli([
      "batch:create", "--type", "gift", "--count", "1",
      "--reward", JSON.stringify({ coins: 1234, credits: 7 }),
      "--prefix", "QA", "--actor", "playwright",
    ])
  );
  const code = created.codes[0];
  expect(code).toBeTruthy();

  const redeem = await api.get("/ekoloko-web/redeemCard.action", {
    params: { userName: USER, password: PASSWORD, code },
  });
  expect(await redeem.text()).toBe('["ok"]');

  const after = JSON.parse(adminCli(["user:show", "--user", USER]));
  expect(after.account.coins).toBe(coinsBefore + 1234);
  expect(after.account.credits).toBe(before.account.credits + 7);

  const again = await api.get("/ekoloko-web/redeemCard.action", {
    params: { userName: USER, password: PASSWORD, code },
  });
  expect(await again.text()).not.toBe('["ok"]');
});
