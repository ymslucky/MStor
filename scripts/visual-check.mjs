/**
 * v7 视觉烟雾闸门：用本机 Chrome/Edge 的 headless + CDP 打开真实构建产物，
 * 注入 mock API，检查关键页面在 1440/390 视口下无横向溢出且核心标记存在，
 * 并输出截图到 .tmp-build/visual（不参与构建、不写回 docs 基线）。
 *
 * 前置：npm run build
 * 运行：npm run visual:check
 * 指定浏览器：CHROME_BIN=/path/to/chrome npm run visual:check
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "client/dist");
const OUT = path.join(ROOT, ".tmp-build/visual");
const PROFILE = path.join(OUT, "chrome-profile");

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const NOW = Date.now();
const node = (id, name, is_dir, size, mime = null) => ({
  id, parent_id: "", name, is_dir, size, mime,
  created_at: NOW - 86400000, updated_at: NOW - 3600000, thumb_key: null, deleted_at: null,
});
const FILES = [
  node("d1", "项目资料", 1, null),
  node("d2", "家庭照片", 1, null),
  node("f1", "年度预算 2027.xlsx", 0, 482112, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  node("f2", "产品需求文档.pdf", 0, 2384111, "application/pdf"),
  node("f3", "旅行照片-京都.jpg", 0, 5820339, "image/jpeg"),
  node("f4", "发布说明.md", 0, 12204, "text/markdown"),
  node("f5", "设计交付物.zip", 0, 18882112, "application/zip"),
];
const ME = {
  id: "u1", name: "Alice", role: "admin", quotaBytes: 109951162368, usedBytes: 61920724992,
  trashRetentionDays: 30, unreadNotifications: 3,
  limits: { smallFileLimit: 62914560, partSize: 16777216 },
  storage: { usedBytes: 61920724992, quotaBytes: 109951162368, level: "normal", trashBytes: 2147483648 },
  self: { id: "u1", name: "Alice", role: "admin" },
  workspace: { id: "w1", name: "我的空间", role: "owner" },
  workspaces: [{ id: "w1", name: "我的空间", role: "owner" }, { id: "w2", name: "家庭共享", role: "member" }],
};
const USER = (id, name, admin, disabled = false, quota = 53687091200) => ({
  id, name, platform_admin: admin ? 1 : 0, quota_bytes: quota, created_at: NOW - 86400000,
  disabled_at: disabled ? NOW - 3600000 : null, email: `${id}@example.com`,
});

const apiResponse = (url) => {
  const p = url.pathname;
  if (p === "/api/me") return ME;
  if (p === "/api/files") return { nodes: FILES, breadcrumb: [], rootId: "root" };
  if (p === "/api/dirs/tree") return { dirs: [], truncated: false };
  if (p === "/api/shares") return { shares: [] };
  if (p === "/api/trash") return { nodes: [] };
  if (p === "/api/library/favorites") return { nodes: [] };
  if (p === "/api/library/recent") return { nodes: FILES.slice(2, 5) };
  if (p === "/api/library/tags") return { tags: [{ id: "t1", name: "重要", nodes: 3, color: "#be123c" }, { id: "t2", name: "家庭", nodes: 1, color: "#0f766e" }] };
  if (p === "/api/library/tags/t1/nodes") return { nodes: FILES.slice(2, 6) };
  if (p.startsWith("/api/library/tags/")) return { nodes: [] };
  if (p === "/api/library/node-tags" || p.startsWith("/api/library/node-tags/")) return { tags: [] };
  if (p === "/api/notifications") return { unread: 3, items: [] };
  if (p === "/api/search") return { nodes: [], paths: {} };
  if (p === "/api/me/admin/overview") {
    return {
      users: { total: 3, active: 2, disabled: 1, platformAdmins: 1 },
      workspaces: { total: 2, members: 3 },
      storage: { usedBytes: ME.usedBytes, quotaBytes: ME.quotaBytes, trashBytes: ME.storage.trashBytes },
      recentAudit: [
        { action: "upload", actorName: "Alice", targetId: "f1", createdAt: NOW - 60000 },
        { action: "share.create", actorName: "Alice", targetId: "s1", createdAt: NOW - 3600000 },
        { action: "member.invite", actorName: "Bob", targetId: "b@example.com", createdAt: NOW - 7200000 },
      ],
      topWorkspaces: [],
    };
  }
  if (p === "/api/me/admin/users") {
    return { users: [USER("u1", "Alice", true, false, ME.quotaBytes), USER("u2", "Bob", false), USER("u3", "Carol", false, true)] };
  }
  return { ok: true };
};

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json",
};

function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (u.pathname === "/api/files/f3/content") {
        res.writeHead(200, { "content-type": "image/svg+xml" });
        res.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280"><rect width="400" height="280" fill="#c7d2fe"/></svg>');
        return;
      }
      if (u.pathname.startsWith("/api/")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(apiResponse(u)));
        return;
      }
      let file = path.join(DIST, decodeURIComponent(u.pathname));
      if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      try {
        const s = await stat(file);
        if (s.isDirectory()) file = path.join(file, "index.html");
      } catch {
        file = path.join(DIST, "index.html");
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        const body = await readFile(path.join(DIST, "index.html"));
        res.writeHead(200, { "content-type": MIME[".html"] });
        res.end(body);
      }
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error("未找到 Chrome/Edge；请用 CHROME_BIN 指定可执行文件");
}

async function launchChrome(exe) {
  await rm(PROFILE, { recursive: true, force: true });
  const chrome = spawn(exe, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking", "--disable-sync",
    "--remote-debugging-port=0", `--user-data-dir=${PROFILE}`, "about:blank",
  ], { stdio: "ignore" });

  const portFile = path.join(PROFILE, "DevToolsActivePort");
  let port = 0;
  for (let i = 0; i < 80 && !port; i++) {
    await sleep(150);
    try {
      const first = (await readFile(portFile, "utf8")).split(/\r?\n/)[0];
      if (first) port = Number(first);
    } catch {
      // not ready
    }
  }
  if (!port) throw new Error("Chrome 未打开 DevTools 端口");

  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch {
      // not ready
    }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error("Chrome 未暴露 page target");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("CDP WebSocket 连接失败"));
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.error) job.reject(new Error(msg.error.message));
    else job.resolve(msg.result);
  };
  const cmd = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await cmd("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "页面脚本异常");
    return result.result?.value;
  };

  return { chrome, ws, cmd, evaluate };
}

async function waitFor(evaluate, expression, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // page navigating
    }
    await sleep(200);
  }
  return false;
}

const CASES = [
  { name: "files-desktop", path: "/", width: 1440, height: 900, marker: "全部文件" },
  {
    name: "files-mobile", path: "/", width: 390, height: 844, marker: "全部文件",
    check: `(() => { const h = document.querySelector('[data-testid="file-list-header"]'); return !h || getComputedStyle(h.parentElement).display === 'none'; })()`,
  },
  { name: "settings-desktop", path: "/settings/account", width: 1440, height: 900, marker: "账户信息" },
  { name: "tags-desktop", path: "/tags?tag=t1", width: 1440, height: 900, marker: "重要" },
  { name: "platform-users", path: "/platform/users", width: 1440, height: 900, marker: "用户管理" },
  { name: "platform-audit", path: "/platform/audit", width: 1440, height: 900, marker: "日志审计" },
  { name: "trash-desktop", path: "/trash", width: 1440, height: 900, marker: "回收站" },
  { name: "shares-desktop", path: "/shares", width: 1440, height: 900, marker: "我的分享" },
  { name: "dark-desktop", path: "/", width: 1440, height: 900, marker: "全部文件", dark: true },
  {
    name: "grid-desktop", path: "/", width: 1440, height: 900, marker: "项目资料",
    setup: "localStorage.setItem('mstor_view','grid'); location.reload(); true",
    check: "!!document.querySelector('[data-testid=\"file-grid\"]')",
  },
];

async function main() {
  await access(path.join(DIST, "index.html")).catch(() => {
    throw new Error("client/dist 不存在：请先运行 npm run build");
  });
  await mkdir(OUT, { recursive: true });
  const exe = await findChrome();
  const { server, base } = await startStaticServer();
  let session;
  const results = [];

  try {
    session = await launchChrome(exe);
    const { cmd, evaluate } = session;
    await cmd("Page.enable");
    await cmd("Runtime.enable");

    for (const c of CASES) {
      await cmd("Emulation.setDeviceMetricsOverride", {
        width: c.width, height: c.height, deviceScaleFactor: 1, mobile: c.width < 600,
      });
      await cmd("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [{ name: "prefers-color-scheme", value: c.dark ? "dark" : "light" }],
      });
      await cmd("Page.navigate", { url: base + c.path });
      await sleep(500);
      if (c.setup) {
        await evaluate(c.setup);
        await sleep(600);
      }
      const markerOk = await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(c.marker)})`);
      const metrics = JSON.parse(await evaluate("JSON.stringify({ vw: innerWidth, sw: document.documentElement.scrollWidth })"));
      const checkOk = c.check ? Boolean(await evaluate(c.check)) : true;
      const shot = await cmd("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const file = path.join(OUT, `${c.name}.png`);
      await writeFile(file, Buffer.from(shot.data, "base64"));
      const problems = [];
      if (!markerOk) problems.push(`缺少标记「${c.marker}」`);
      if (!checkOk) problems.push("页面自检失败");
      if (metrics.sw > metrics.vw + 1) problems.push(`横向溢出 ${metrics.sw} > ${metrics.vw}`);
      results.push({ name: c.name, size: `${c.width}×${c.height}`, problems });
    }
  } finally {
    if (session) {
      session.ws.close();
      if (process.platform === "win32") {
        await new Promise((resolve) => {
          const k = spawn("taskkill", ["/PID", String(session.chrome.pid), "/T", "/F"], { stdio: "ignore" });
          k.on("close", resolve);
          k.on("error", resolve);
        });
      } else {
        session.chrome.kill("SIGKILL");
      }
    }
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = results.filter((r) => r.problems.length > 0);
  for (const r of results) {
    const ok = r.problems.length === 0;
    console.log(`${ok ? "PASS" : "FAIL"}  ${r.name.padEnd(18)} ${r.size}  ${r.problems.join("；") || "no overflow"}`);
  }
  console.log(`\n视觉检查：${results.length - failed.length}/${results.length} 通过；截图目录 .tmp-build/visual`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
