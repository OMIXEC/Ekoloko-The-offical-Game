"use strict";

const state = {
  lang: localStorage.getItem("ekadmin-lang") || "he",
  dict: {},
  en: {},
  me: null,
  totp: localStorage.getItem("ekadmin-totp") || "",
  loginNeedsTotp: false,
  view: "overview",
  userId: null,
  tab: "profile",
  userData: null,
  codesBatch: "",
  sqlResult: null,
  sqlHistory: [],
};

const app = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const toastEl = document.getElementById("toast");

function esc(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function t(key) {
  return state.dict[key] || state.en[key] || key;
}
function fmtNum(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(state.lang === "he" ? "he-IL" : "en-US").format(Number(value));
}
function fmtDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(state.lang === "he" ? "he-IL" : "en-US", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(Number(value)));
}
function boolPill(value) {
  return value ? `<span class="pill yes">${t("yes")}</span>` : `<span class="pill no">${t("no")}</span>`;
}
function notify(message, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = message;
  toastEl.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.totp) headers["X-TOTP"] = state.totp;
  if (options.headers) Object.assign(headers, options.headers);
  const response = await fetch("/admin/api" + path, {
    credentials: "same-origin",
    ...options,
    headers,
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
  if (!response.ok || !payload.ok) throw new Error(payload.error || "HTTP " + response.status);
  return payload.data;
}

function applyLang(lang) {
  state.lang = lang;
  localStorage.setItem("ekadmin-lang", lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
}

async function loadI18n() {
  const [he, en] = await Promise.all([
    fetch("./i18n/he.json").then((r) => r.json()),
    fetch("./i18n/en.json").then((r) => r.json()),
  ]);
  state.dict = state.lang === "he" ? he : en;
  state.en = en;
  applyLang(state.lang);
}

// ── generic UI pieces ───────────────────────────────────────────────────

function table(rows, columns, options = {}) {
  if (!rows || !rows.length) return `<div class="empty">${t("noData")}</div>`;
  const head = columns.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("");
  const body = rows.map((row, index) => {
    const cells = columns.map((c) => {
      const value = c.render ? c.render(row, index) : esc(row[c.key]);
      return `<td class="${c.num ? "num" : ""} ${c.mono ? "mono" : ""}">${value}</td>`;
    }).join("");
    return `<tr ${options.rowAct ? `data-act="${options.rowAct}" data-id="${esc(row.id)}"` : ""}>${cells}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function modal(title, fields, values = {}) {
  return new Promise((resolve) => {
    const form = fields.map((f) => {
      const val = values[f.name] !== undefined ? values[f.name] : f.value !== undefined ? f.value : "";
      let input;
      if (f.type === "select") {
        input = `<select name="${f.name}">${(f.options || []).map((o) => {
          const value = typeof o === "string" ? o : o.value;
          const label = typeof o === "string" ? o : o.label;
          return `<option value="${esc(value)}" ${String(value) === String(val) ? "selected" : ""}>${esc(label)}</option>`;
        }).join("")}</select>`;
      } else if (f.type === "textarea") {
        input = `<textarea name="${f.name}" ${f.mono ? "" : ""}>${esc(val)}</textarea>`;
      } else {
        input = `<input name="${f.name}" type="${f.type || "text"}" value="${esc(val)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""} ${f.required ? "required" : ""}>`;
      }
      return `<div class="field ${f.wide ? "wide" : ""}"><label>${esc(f.label)}</label>${input}</div>`;
    }).join("");
    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-act="modal-cancel">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>${esc(title)}</h3>
          <form id="modal-form"><div class="form-grid">${form}</div>
            <div class="modal-actions">
              <button type="button" data-act="modal-cancel">${t("cancel")}</button>
              <button type="submit" class="primary">${t("save")}</button>
            </div>
          </form>
        </div>
      </div>`;
    const close = (value) => { modalRoot.innerHTML = ""; resolve(value); };
    modalRoot.querySelector("#modal-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = {};
      new FormData(event.target).forEach((value, key) => { data[key] = value; });
      close(data);
    });
    modalRoot.querySelectorAll('[data-act="modal-cancel"]').forEach((el) =>
      el.addEventListener("click", (event) => {
        if (event.target === el || el.tagName === "BUTTON") close(null);
      }));
  });
}

function card(title, body) {
  return `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
}

// ── shell ───────────────────────────────────────────────────────────────

function loginScreen(message) {
  app.innerHTML = `<div class="login-wrap"><form class="login-card" id="login-form">
    <h1>${t("appTitle")}</h1>
    <p>${t("signIn")}</p>
    ${message ? `<div class="error">${esc(message)}</div>` : ""}
    <div class="field"><label>${t("username")}</label><input id="login-user" name="username" autocomplete="username" required></div>
    <div class="field"><label>${t("password")}</label><input id="login-pass" name="password" type="password" autocomplete="current-password" required></div>
    ${state.loginNeedsTotp ? `<div class="field"><label>${t("verificationCode")}</label><input id="login-totp" name="totp" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>` : ""}
    <div class="field"><label>${t("language")}</label><select id="login-lang">
      <option value="he" ${state.lang === "he" ? "selected" : ""}>עברית</option>
      <option value="en" ${state.lang === "en" ? "selected" : ""}>English</option>
    </select></div>
    <button type="submit" class="primary" style="width:100%">${t("signIn")}</button>
  </form></div>`;
  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      username: document.getElementById("login-user").value,
      password: document.getElementById("login-pass").value,
      totp: document.getElementById("login-totp")?.value || undefined,
    };
    try {
      const result = await api("/auth/login", { method: "POST", body });
      if (result.needsTotp) { state.loginNeedsTotp = true; loginScreen(t("needsTotp")); return; }
      state.me = result.user;
      const extra = await api("/auth/me");
      state.me = extra.user;
      state.me.permissions = extra.permissions;
      state.loginNeedsTotp = false;
      location.hash = "#/overview";
      render();
    } catch (error) {
      loginScreen(error.message);
    }
  });
  document.getElementById("login-lang").addEventListener("change", (event) => {
    applyLang(event.target.value);
    loadI18n().then(() => loginScreen());
  });
}

function navItem(view, labelKey) {
  return `<button class="nav-item ${state.view === view ? "active" : ""}" data-act="nav" data-view="${view}">${t(labelKey)}</button>`;
}

function shell(body) {
  const canSee = (permission) => !state.me.permissions || state.me.permissions.includes(permission);
  app.innerHTML = `<a class="skip-link" href="#main">${t("details")}</a>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">${t("appTitle")}</div>
      <nav class="nav" aria-label="Admin">
        <div class="nav-group">${t("overview")}</div>
        ${navItem("overview", "dashboard")}
        <div class="nav-group">${t("users")}</div>
        ${canSee("users:read") ? navItem("users", "users") : ""}
        ${canSee("entitlements:read") ? navItem("entitlements", "entitlements") : ""}
        ${canSee("subscriptions:read") ? navItem("subscriptions", "subscriptions") : ""}
        <div class="nav-group">${t("catalog")}</div>
        ${canSee("catalog:read") ? navItem("catalog", "catalog") : ""}
        ${canSee("codes:read") ? navItem("codes", "codes") : ""}
        <div class="nav-group">${t("audit")}</div>
        ${canSee("audit:read") ? navItem("audit", "audit") : ""}
        ${canSee("sql:read") ? navItem("sql", "sqlConsole") : ""}
        ${canSee("admins:read") ? navItem("admins", "adminUsers") : ""}
      </nav>
    </aside>
    <main class="main" id="main">
      <header class="topbar">
        <h2>${esc(body.title)}</h2>
        <div class="spacer"></div>
        <div class="totp-box"><label class="muted" for="global-totp">${t("verificationCode")}</label>
          <input id="global-totp" value="${esc(state.totp)}" maxlength="6" inputmode="numeric" placeholder="000000"></div>
        <select id="global-lang" aria-label="${t("language")}">
          <option value="he" ${state.lang === "he" ? "selected" : ""}>עברית</option>
          <option value="en" ${state.lang === "en" ? "selected" : ""}>English</option>
        </select>
        <button data-act="logout">${t("logout")}</button>
      </header>
      <div id="view-content">${body.html}</div>
    </main>
  </div>`;
  document.getElementById("global-totp").addEventListener("change", (event) => {
    state.totp = event.target.value.trim();
    localStorage.setItem("ekadmin-totp", state.totp);
  });
  document.getElementById("global-lang").addEventListener("change", async (event) => {
    applyLang(event.target.value);
    await loadI18n();
    render();
  });
}

function busy(html) {
  return `<div class="card">${t("loading")}${html || ""}</div>`;
}

async function overviewView() {
  const data = await api("/overview");
  const pairs = [
    ["activeUsers", data.users], ["activeEntitlements", data.activeEntitlements],
    ["activeSubscriptions", data.activeSubscriptions], ["unusedCodes", data.unusedCodes],
    ["expiringCodes", data.expiringCodes], ["redemptionsToday", data.redemptionsToday],
    ["auditEntries", data.auditEntries], ["bannedUsers", data.bannedUsers],
  ];
  const kpis = `<div class="grid kpis">${pairs.map(([label, value]) =>
    `<div class="kpi"><div class="label">${t(label)}</div><div class="value">${fmtNum(value)}</div></div>`).join("")}</div>`;
  const recent = table(data.recentAudit.map((row) => ({
    ...row, when: fmtDate(row.created_at), target: `${row.target_type ?? ""} ${row.target_id ?? ""}`.trim(),
  })), [
    { key: "when", label: t("time") }, { key: "actor", label: t("actor") },
    { key: "action", label: t("action") }, { key: "target", label: t("target") },
    { key: "reason", label: t("reason") },
  ]);
  return { title: t("dashboard"), html: card(t("dashboard"), kpis) + card(t("recentAudit"), recent) };
}

async function usersView() {
  const query = new URLSearchParams(location.hash.split("?")[1] || "").get("q") || "";
  const data = await api(`/users?q=${encodeURIComponent(query)}&limit=100`);
  const search = `<div class="toolbar">
    <input id="user-search" value="${esc(query)}" placeholder="${t("search")}" aria-label="${t("search")}">
    <button data-act="user-search">${t("search")}</button>
    <span class="muted">${t("total")}: ${fmtNum(data.total)}</span>
  </div>`;
  const rows = table(data.items.map((u) => ({
    ...u, when: fmtDate(u.created_at), last: fmtDate(u.last_login),
    status: u.is_banned ? `<span class="pill deny">${t("banned")}</span>` : `<span class="pill allow">${t("no")} ${t("banned")}</span>`,
  })), [
    { key: "id", label: t("id"), num: true }, { key: "username", label: t("username") },
    { key: "email", label: t("email") }, { key: "coins", label: t("coins"), num: true },
    { key: "credits", label: t("credits"), num: true }, { key: "level", label: t("level"), num: true },
    { key: "status", label: t("status") }, { key: "last", label: t("lastLogin") },
    { key: "when", label: t("created") },
  ], { rowAct: "open-user" });
  return { title: t("users"), html: card(t("users"), search + rows) };
}

const USER_TABS = ["profile", "inventory", "cards", "animals", "quests", "house", "storage", "potions", "scores", "chat", "entitlements", "subscriptions", "sessions", "notes", "redemptions", "audit"];

async function userDetailView(id) {
  const data = await api(`/users/${id}`);
  state.userData = data;
  const u = data.user;
  const tabs = `<div class="tabs" role="tablist">${USER_TABS.map((tab) =>
    `<button class="tab ${state.tab === tab ? "active" : ""}" data-act="user-tab" data-tab="${tab}" role="tab">${t(tab)}</button>`).join("")}</div>`;
  const actions = `<div class="toolbar">
    <button data-act="user-edit">${t("edit")}</button>
    <button data-act="user-ban" class="danger">${t("ban")}</button>
    <button data-act="user-unban" class="ok">${t("unban")}</button>
    <button data-act="user-password">${t("resetPassword")}</button>
    <button data-act="user-grant-ent">${t("grantEntitlement")}</button>
    <button data-act="user-note">${t("addNote")}</button>
  </div>`;
  const profileRows = [
    [t("id"), u.id], [t("username"), u.username], [t("email"), u.email],
    [t("gender"), u.gender], [t("coins"), fmtNum(u.coins)], [t("credits"), fmtNum(u.credits)],
    [t("xp"), fmtNum(u.xp)], [t("level"), u.level], [t("moderator"), boolPill(u.is_moderator)],
    [t("ranger"), u.ranger_level], [t("banned"), boolPill(u.is_banned)],
    [t("lastLogin"), fmtDate(u.last_login)], [t("created"), fmtDate(u.created_at)],
    [t("reason"), u.ban_reason || "—"],
  ];
  let tabContent = "";
  switch (state.tab) {
    case "profile":
      tabContent = `<div class="table-wrap"><table><tbody>${profileRows.map(([k, v]) =>
        `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("")}</tbody></table></div>`;
      break;
    case "house":
      tabContent = `<pre class="mono" style="white-space:pre-wrap">${esc(JSON.stringify(data.house, null, 2))}</pre>`;
      break;
    case "notes":
      tabContent = table(data.notes.map((n) => ({ ...n, when: fmtDate(n.created_at) })), [
        { key: "id", label: t("id"), num: true }, { key: "author", label: t("actor") },
        { key: "note", label: t("note") }, { key: "when", label: t("time") },
      ]);
      break;
    case "entitlements":
      tabContent = table(data.entitlements.map((e) => ({ ...e, when: fmtDate(e.granted_at), until: fmtDate(e.expires_at) })), [
        { key: "id", label: t("id"), num: true }, { key: "kind", label: t("kind") },
        { key: "source", label: t("reason") }, { key: "active", label: t("status"), render: (r) => boolPill(r.active) },
        { key: "when", label: t("created") }, { key: "until", label: t("to") },
      ]) + `<div class="toolbar"><button data-act="ent-revoke-form">${t("revoke")}</button></div>`;
      break;
    case "audit":
      tabContent = table(data.audit.map((a) => ({ ...a, when: fmtDate(a.created_at) })), [
        { key: "when", label: t("time") }, { key: "actor", label: t("actor") },
        { key: "action", label: t("action") }, { key: "reason", label: t("reason") },
      ]);
      break;
    default: {
      const list = data[state.tab] || [];
      const columns = list.length ? Object.keys(list[0]).slice(0, 8).map((key) => ({ key, label: key })) : [];
      tabContent = table(list, columns);
    }
  }
  return {
    title: `${t("users")} #${u.id} — ${u.username}`,
    html: card(`${u.username}`, actions + tabs + tabContent),
  };
}

async function entitlementsView() {
  const [kinds, batches] = await Promise.all([api("/entitlements/kinds"), api("/codes/batches?limit=5")]);
  const kindTable = table(kinds, [
    { key: "kind", label: t("kind") }, { key: "label_he", label: t("labelHe") },
    { key: "label_en", label: t("labelEn") }, { key: "rank", label: t("rank"), num: true },
    { key: "gating_mode", label: t("gatingMode") }, { key: "default_days", label: t("defaultDays"), num: true },
  ], { rowAct: "edit-kind" });
  return {
    title: t("entitlements"),
    html: card(t("entitlementKinds"), kindTable) +
      card(t("grantEntitlement"), `<div class="toolbar">
        <button data-act="grant-ent" class="primary">${t("grant")}</button>
        <button data-act="new-kind">${t("add")}</button></div>`),
  };
}

async function catalogView() {
  const [entries, collections, drift] = await Promise.all([
    api("/catalog"), api("/catalog/collections"), api("/catalog/drift"),
  ]);
  const entryTable = table(entries.map((e) => ({ ...e, when: fmtDate(e.updated_at) })), [
    { key: "kind", label: t("entityKind") }, { key: "entity_id", label: t("entityId"), num: true },
    { key: "published", label: t("status"), render: (r) => boolPill(r.published) },
    { key: "updated_by", label: t("actor") }, { key: "when", label: t("time") },
  ], { rowAct: "edit-entry" });
  const collectionTable = table(collections, [
    { key: "id", label: t("id"), num: true }, { key: "name", label: t("collectionName") },
    { key: "name_he", label: t("collectionNameHe") }, { key: "description", label: t("description") },
  ]);
  const driftHtml = `<div class="grid kpis">
    <div class="kpi"><div class="label">${t("emptyStores")}</div><div class="value">${drift.emptyStores.length}</div></div>
    <div class="kpi"><div class="label">${t("unpublished")}</div><div class="value">${drift.unpublished.length}</div></div>
  </div>`;
  return {
    title: t("catalog"),
    html: card(t("drift"), driftHtml) + card(t("entries"), entryTable) +
      card(t("collections"), `<div class="toolbar"><button data-act="new-collection">${t("add")}</button></div>` + collectionTable),
  };
}

async function codesView() {
  const [batches, codes] = await Promise.all([
    api("/codes/batches?limit=100"),
    api(state.codesBatch ? `/codes?batchId=${state.codesBatch}&limit=100` : "/codes?limit=100"),
  ]);
  const batchTable = table(batches.map((b) => ({ ...b, when: fmtDate(b.created_at), until: fmtDate(b.expires_at) })), [
    { key: "id", label: t("id"), num: true }, { key: "name", label: t("batch") },
    { key: "type", label: t("type") }, { key: "count", label: t("count"), num: true },
    { key: "when", label: t("created") }, { key: "until", label: t("to") },
  ], { rowAct: "filter-batch" });
  const codeTable = table(codes.items.map((c) => ({ ...c, when: fmtDate(c.used_at) })), [
    { key: "id", label: t("id"), num: true }, { key: "batch_id", label: t("batchId"), num: true },
    { key: "code_hint", label: t("code"), mono: true }, { key: "status", label: t("status") },
    { key: "used_by", label: t("userId"), num: true }, { key: "when", label: t("time") },
  ]);
  return {
    title: t("codes"),
    html: card(t("createBatch"), `<div class="toolbar"><button class="primary" data-act="new-batch">${t("create")}</button></div>`) +
      card(t("batches"), batchTable) +
      card(t("codesList"), `<div class="toolbar">
        <select id="batch-filter"><option value="">${t("all")}</option>${batches.map((b) =>
          `<option value="${b.id}" ${String(state.codesBatch) === String(b.id) ? "selected" : ""}>#${b.id} ${esc(b.name)}</option>`).join("")}</select>
        <button data-act="redeem-form">${t("redeem")}</button>
        <button data-act="revoke-code-form" class="danger">${t("revokeCode")}</button>
        <button data-act="revoke-batch-form" class="danger">${t("revokeBatch")}</button>
      </div>` + codeTable),
  };
}

async function subscriptionsView() {
  const rows = await api("/subscriptions");
  const tableHtml = table(rows.map((s) => ({ ...s, until: fmtDate(s.current_period_end), when: fmtDate(s.created_at) })), [
    { key: "id", label: t("id"), num: true }, { key: "username", label: t("user") },
    { key: "plan", label: t("plan") }, { key: "provider", label: t("actor") },
    { key: "status", label: t("status") }, { key: "until", label: t("to") }, { key: "when", label: t("created") },
  ]);
  return {
    title: t("subscriptions"),
    html: card(t("subscriptions"), `<div class="toolbar">
      <button class="primary" data-act="grant-sub">${t("grant")}</button>
      <button class="danger" data-act="revoke-sub">${t("revoke")}</button></div>` + tableHtml),
  };
}

async function auditView() {
  const rows = await api("/audit?limit=200");
  const tableHtml = table(rows.items.map((a) => ({ ...a, when: fmtDate(a.created_at), target: `${a.target_type ?? ""} ${a.target_id ?? ""}`.trim() })), [
    { key: "id", label: t("id"), num: true }, { key: "when", label: t("time") },
    { key: "actor", label: t("actor") }, { key: "action", label: t("action") },
    { key: "target", label: t("target") }, { key: "reason", label: t("reason") },
    { key: "before", label: t("before"), render: (r) => r.before ? `<details><summary>${t("details")}</summary><pre class="mono">${esc(JSON.stringify(r.before, null, 2))}</pre></details>` : "—" },
    { key: "after", label: t("after"), render: (r) => r.after ? `<details><summary>${t("details")}</summary><pre class="mono">${esc(JSON.stringify(r.after, null, 2))}</pre></details>` : "—" },
  ]);
  return { title: t("audit"), html: card(t("audit"), tableHtml) };
}

function sqlView() {
  const result = state.sqlResult;
  const resultHtml = result ? `<div class="card"><h3>${t("results")}</h3>
    ${result.preview ? `<p class="muted">${t("preview")}: ${fmtNum(result.changes)}</p>` : ""}
    ${table(result.rows.slice(0, 200), result.rows.length ? Object.keys(result.rows[0]).map((key) => ({ key, label: key })) : [])}
    ${!result.rows.length && result.changes ? `<p>${t("success")}: ${fmtNum(result.changes)}</p>` : ""}
  </div>` : "";
  return {
    title: t("sqlConsole"),
    html: card(t("sqlConsole"), `<p class="muted">${t("sqlHint")} ${t("protectedTables")}</p>
      <div class="field"><label>SQL</label><textarea id="sql-text" dir="ltr" style="text-align:left">SELECT id, username, coins FROM users ORDER BY id DESC LIMIT 20</textarea></div>
      <div class="form-grid">
        <div class="field"><label>${t("mode")}</label><select id="sql-mode"><option value="read">${t("read")}</option><option value="write">${t("write")}</option></select></div>
        <div class="field"><label>${t("params")}</label><input id="sql-params" value="[]" dir="ltr" style="text-align:left"></div>
        <div class="field"><label>${t("reason")}</label><input id="sql-reason"></div>
        <div class="field"><label>${t("preview")}</label><select id="sql-preview"><option value="1">${t("yes")}</option><option value="0">${t("no")}</option></select></div>
      </div>
      <div class="toolbar"><button class="primary" data-act="sql-run">${t("run")}</button>
        <button data-act="sql-history">${t("history")}</button></div>`) + resultHtml +
      (state.sqlHistory.length ? card(t("history"), table(state.sqlHistory.map((h) => ({ ...h, when: fmtDate(h.created_at) })), [
        { key: "when", label: t("time") }, { key: "actor", label: t("actor") },
        { key: "mode", label: t("mode") }, { key: "sql", label: "SQL", mono: true },
        { key: "reason", label: t("reason") },
      ])) : ""),
  };
}

async function adminsView() {
  const rows = await api("/admins");
  return {
    title: t("adminUsers"),
    html: card(t("adminUsers"), `<div class="toolbar"><button class="primary" data-act="new-admin">${t("addAdmin")}</button></div>` +
      table(rows.map((a) => ({ ...a, when: fmtDate(a.created_at), last: fmtDate(a.last_login_at) })), [
        { key: "id", label: t("id"), num: true }, { key: "username", label: t("username") },
        { key: "role", label: t("role") }, { key: "totp_enabled", label: t("totp"), render: (r) => boolPill(r.totp_enabled) },
        { key: "disabled", label: t("disabled"), render: (r) => boolPill(r.disabled) },
        { key: "when", label: t("created") }, { key: "last", label: t("lastLogin") },
        { key: "actions", label: t("actions"), render: (r) => `<button class="small" data-act="edit-admin" data-id="${r.id}">${t("edit")}</button>` },
      ])),
  };
}

const VIEWS = {
  overview: overviewView, users: usersView, entitlements: entitlementsView,
  catalog: catalogView, codes: codesView, subscriptions: subscriptionsView,
  audit: auditView, sql: sqlView, admins: adminsView,
};

async function render() {
  if (!state.me) { loginScreen(); return; }
  const route = location.hash.replace(/^#\/?/, "");
  let view = route.split("?")[0] || "overview";
  if (view === "user") {
    state.userId = Number(route.match(/user\/(\d+)/)?.[1] || state.userId);
    view = "user";
  }
  if (!VIEWS[view] && view !== "user") view = "overview";
  state.view = view === "user" ? "users" : view;
  try {
    const body = view === "user" ? await userDetailView(state.userId) : await VIEWS[view]();
    shell(body);
  } catch (error) {
    shell({ title: t("error"), html: `<div class="error">${esc(error.message)}</div>` });
  }
}

// ── actions ─────────────────────────────────────────────────────────────

function reasonField() {
  return { name: "reason", label: t("reason"), required: true };
}

document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "modal-cancel") return;
  event.preventDefault();
  const id = Number(el.dataset.id || 0);
  try {
    switch (act) {
      case "nav":
        location.hash = "#/" + el.dataset.view;
        render();
        break;
      case "logout":
        await api("/auth/logout", { method: "POST", body: {} });
        state.me = null;
        location.hash = "";
        render();
        break;
      case "user-search":
        location.hash = "#/users?q=" + encodeURIComponent(document.getElementById("user-search").value);
        render();
        break;
      case "open-user":
        state.tab = "profile";
        location.hash = "#/user/" + el.dataset.id;
        render();
        break;
      case "user-tab":
        state.tab = el.dataset.tab;
        render();
        break;
      case "filter-batch":
        state.codesBatch = String(el.dataset.id);
        render();
        break;
      case "user-edit": {
        const u = state.userData.user;
        const values = await modal(t("edit"), [
          { name: "username", label: t("username") }, { name: "email", label: t("email") },
          { name: "coins", label: t("coins"), type: "number" }, { name: "credits", label: t("credits"), type: "number" },
          { name: "xp", label: t("xp"), type: "number" }, { name: "level", label: t("level"), type: "number" },
          { name: "ranger_level", label: t("ranger"), type: "number" },
          { name: "premium", label: "Premium", type: "select", options: [{ value: "0", label: t("no") }, { value: "1", label: t("yes") }] },
          { name: "reason", label: t("reason"), required: true },
        ], { ...u, premium: String(u.premium) });
        if (!values) return;
        const { reason, ...patch } = values;
        await api(`/users/${id}`, { method: "PATCH", body: { patch, reason } });
        notify(t("changesSaved"));
        render();
        break;
      }
      case "user-ban":
      case "user-unban": {
        const values = await modal(act === "user-ban" ? t("ban") : t("unban"), [reasonField()]);
        if (!values) return;
        await api(`/users/${id}/${act === "user-ban" ? "ban" : "unban"}`, { method: "POST", body: values });
        notify(t("changesSaved"));
        render();
        break;
      }
      case "user-password": {
        const values = await modal(t("resetPassword"), [
          { name: "newPassword", label: t("newPassword"), type: "password", required: true }, reasonField(),
        ]);
        if (!values) return;
        await api(`/users/${id}/password`, { method: "POST", body: values });
        notify(t("changesSaved"));
        break;
      }
      case "user-grant-ent":
      case "grant-ent": {
        const kinds = await api("/entitlements/kinds");
        const targetId = act === "grant-ent" ? Number((await modal(t("grant"), [
          { name: "userId", label: t("userId"), type: "number", required: true },
        ]))?.userId || 0) : id;
        if (!targetId) return;
        const values = await modal(t("grantEntitlement"), [
          { name: "kind", label: t("kind"), type: "select", options: kinds.map((k) => ({ value: k.kind, label: k.label_he || k.label_en })) },
          { name: "days", label: t("days"), type: "number" },
          { name: "reason", label: t("reason"), required: true },
        ]);
        if (!values) return;
        await api("/entitlements/grant", { method: "POST", body: { ...values, userId: targetId } });
        notify(t("changesSaved"));
        render();
        break;
      }
      case "ent-revoke-form": {
        const values = await modal(t("revoke"), [
          { name: "id", label: t("id"), type: "number", required: true }, reasonField(),
        ]);
        if (!values) return;
        await api(`/entitlements/${values.id}`, { method: "DELETE", body: { userId: id, reason: values.reason } });
        notify(t("changesSaved"));
        render();
        break;
      }
      case "user-note": {
        const values = await modal(t("addNote"), [{ name: "note", label: t("note"), required: true }]);
        if (!values) return;
        await api(`/users/${id}/notes`, { method: "POST", body: values });
        render();
        break;
      }
      case "edit-kind": {
        const kinds = await api("/entitlements/kinds");
        const current = kinds.find((k) => k.kind === el.dataset.id);
        const values = await modal(t("edit"), [
          { name: "label_en", label: t("labelEn") }, { name: "label_he", label: t("labelHe") },
          { name: "rank", label: t("rank"), type: "number" }, { name: "default_days", label: t("defaultDays"), type: "number" },
          { name: "gating_mode", label: t("gatingMode"), type: "select", options: ["off", "suggest", "required", "strict"] },
        ], current);
        if (!values) return;
        await api(`/entitlements/kinds/${encodeURIComponent(el.dataset.id)}`, { method: "PUT", body: values });
        render();
        break;
      }
      case "new-kind": {
        const values = await modal(t("add"), [
          { name: "kind", label: t("kind"), required: true }, { name: "label_en", label: t("labelEn") },
          { name: "label_he", label: t("labelHe") }, { name: "rank", label: t("rank"), type: "number" },
          { name: "gating_mode", label: t("gatingMode"), type: "select", options: ["off", "suggest", "required", "strict"] },
        ]);
        if (!values) return;
        await api(`/entitlements/kinds/${encodeURIComponent(values.kind)}`, { method: "PUT", body: values });
        render();
        break;
      }
      case "edit-entry": {
        const entries = await api("/catalog");
        const current = entries.find((e) => e.id === id);
        const values = await modal(t("edit"), [
          { name: "data", label: t("entryData"), type: "textarea", value: current?.data_json, required: true },
          { name: "publish", label: t("publish"), type: "select", options: [{ value: "1", label: t("yes") }, { value: "0", label: t("no") }] },
        ]);
        if (!values) return;
        let data;
        try { data = JSON.parse(values.data); } catch (error) { notify(t("error") + ": " + error.message, true); return; }
        await api(`/catalog/${current.kind}/${current.entity_id}`, { method: "PUT", body: { data, publish: values.publish === "1" } });
        render();
        break;
      }
      case "new-collection": {
        const values = await modal(t("add"), [
          { name: "name", label: t("collectionName"), required: true }, { name: "nameHe", label: t("collectionNameHe") },
          { name: "description", label: t("description") },
        ]);
        if (!values) return;
        await api("/catalog/collections", { method: "POST", body: values });
        render();
        break;
      }
      case "new-batch": {
        const values = await modal(t("createBatch"), [
          { name: "name", label: t("batch") }, { name: "type", label: t("type"), type: "select", options: ["code", "gift", "rav"] },
          { name: "count", label: t("count"), type: "number", value: "10", required: true },
          { name: "days", label: t("days"), type: "number", value: "30" },
          { name: "prefix", label: t("prefix") },
          { name: "reward", label: t("rewardJson"), type: "textarea", value: '{"coins":100,"credits":5,"itemIds":[1],"entitlement":"pioneer"}', required: true },
          { name: "reason", label: t("reason"), required: true },
        ]);
        if (!values) return;
        const result = await api("/codes/batch", { method: "POST", body: { ...values, reward: JSON.parse(values.reward) } });
        notify(t("oneTimeCsv") + "\n" + result.codes.slice(0, 10).join("\n"));
        render();
        break;
      }
      case "redeem-form": {
        const values = await modal(t("redeem"), [
          { name: "code", label: t("code"), required: true }, { name: "userId", label: t("userId"), type: "number", required: true },
          { name: "reason", label: t("reason"), required: true },
        ]);
        if (!values) return;
        await api("/codes/redeem", { method: "POST", body: values });
        notify(t("success"));
        render();
        break;
      }
      case "revoke-code-form": {
        const values = await modal(t("revokeCode"), [{ name: "code", label: t("code"), required: true }, reasonField()]);
        if (!values) return;
        await api("/codes/revoke", { method: "POST", body: values });
        render();
        break;
      }
      case "revoke-batch-form": {
        const values = await modal(t("revokeBatch"), [{ name: "batchId", label: t("batchId"), type: "number", required: true }, reasonField()]);
        if (!values) return;
        await api(`/codes/batch/${values.batchId}/revoke`, { method: "POST", body: { reason: values.reason } });
        render();
        break;
      }
      case "grant-sub": {
        const values = await modal(t("grant"), [
          { name: "userId", label: t("userId"), type: "number", required: true },
          { name: "plan", label: t("plan"), required: true },
          { name: "days", label: t("days"), type: "number", value: "30" },
          { name: "reason", label: t("reason"), required: true },
        ]);
        if (!values) return;
        await api("/subscriptions/grant", { method: "POST", body: values });
        render();
        break;
      }
      case "revoke-sub": {
        const values = await modal(t("revoke"), [
          { name: "userId", label: t("userId"), type: "number", required: true },
          { name: "subscriptionId", label: t("subscriptionId"), type: "number", required: true },
          { name: "reason", label: t("reason"), required: true },
        ]);
        if (!values) return;
        await api("/subscriptions/revoke", { method: "POST", body: values });
        render();
        break;
      }
      case "sql-run": {
        const body = {
          sql: document.getElementById("sql-text").value,
          mode: document.getElementById("sql-mode").value,
          params: JSON.parse(document.getElementById("sql-params").value || "[]"),
          reason: document.getElementById("sql-reason").value,
          preview: document.getElementById("sql-preview").value === "1",
        };
        state.sqlResult = await api("/sql/query", { method: "POST", body });
        render();
        break;
      }
      case "sql-history":
        state.sqlHistory = await api("/sql/history?limit=100");
        render();
        break;
      case "new-admin": {
        const values = await modal(t("addAdmin"), [
          { name: "username", label: t("username"), required: true },
          { name: "password", label: t("password"), type: "password", required: true },
          { name: "role", label: t("adminRole"), type: "select", options: ["viewer", "operator", "admin", "owner"] },
        ]);
        if (!values) return;
        await api("/admins", { method: "POST", body: values });
        render();
        break;
      }
      case "edit-admin": {
        const values = await modal(t("edit"), [
          { name: "role", label: t("role"), type: "select", options: ["viewer", "operator", "admin", "owner"] },
          { name: "disabled", label: t("disabled"), type: "select", options: [{ value: "0", label: t("no") }, { value: "1", label: t("yes") }] },
          { name: "password", label: t("newPassword"), type: "password" },
          { name: "reason", label: t("reason") },
        ]);
        if (!values) return;
        await api(`/admins/${id}`, { method: "PATCH", body: values });
        render();
        break;
      }
      default:
        break;
    }
  } catch (error) {
    notify(error.message, true);
  }
});

async function boot() {
  await loadI18n();
  try {
    const me = await api("/auth/me");
    state.me = me.user;
    state.me.permissions = me.permissions;
  } catch {
    state.me = null;
  }
  render();
}

boot();
