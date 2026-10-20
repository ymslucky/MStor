#!/usr/bin/env node
/**
 * 服务端行为测试（替代本机跑不起来的 vitest）：
 *   1) 用 tsc 把 server/** 编译成 CommonJS 到 .tmp-verify（绕开 ESM 无扩展名解析）
 *   2) 用 node:sqlite 实现一个最小 D1 垫片（prepare/bind/all/first/run/batch）
 *   3) 直接调用生产函数，断言真实行效果
 *
 * 为什么需要它：本环境 vitest 起不来（esbuild 配置打包 spawn EPERM，Miniflare 的 workerd 也起不来），
 * 而删除/移动/配额这些路径恰恰是最不能靠"看代码觉得对"的地方。SQLite 语义与 D1 一致，够用。
 *
 * 用法：npm run test:sql
 */
const { execSync } = require("node:child_process");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { join } = require("node:path");

const root = join(__dirname, "..");
const outDir = join(root, ".tmp-verify");

function build() {
  execSync("npx tsc -p scripts/tsconfig.harness.json", { cwd: root, stdio: "inherit" });
  // 编译产物是 CommonJS：在输出目录放一个 package.json 覆盖根目录的 "type": "module"
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }));
}

class Stmt {
  constructor(db, sql, params) {
    this.db = db;
    this.sql = sql;
    this.params = params || [];
  }
  bind(...args) {
    return new Stmt(this.db, this.sql, args);
  }
  _prep() {
    return this.db._raw.prepare(this.sql);
  }
  all(...args) {
    const p = this.params.length ? this.params : args;
    const rows = this._prep().all(...p).map((r) => ({ ...r }));
    return { results: rows, success: true, meta: { changes: 0 } };
  }
  first(...args) {
    const p = this.params.length ? this.params : args;
    const row = this._prep().get(...p);
    return row ? { ...row } : null;
  }
  run(...args) {
    const p = this.params.length ? this.params : args;
    const info = this._prep().run(...p);
    return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

function makeD1(schemaSql) {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec(schemaSql);
  const db = {
    _raw: raw,
    prepare: (sql) => new Stmt(db, sql),
    exec: (sql) => raw.exec(sql),
    batch: (stmts) => {
      raw.exec("BEGIN");
      try {
        // D1 的 batch 对 SELECT 返回结果集，对写入返回 meta；垫片按语句类型分派（否则读取闭包永远是空）
        const out = stmts.map((s) => (/^\s*(select|with)\b/i.test(s.sql) ? s.all() : s.run()));
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
    _sql: 0,
    count(sql) { this._sql += 1; return this.prepare(sql); },
  };
  // 统计语句数：包一层 prepare
  const origPrepare = db.prepare;
  db.prepare = (sql) => { db._sql += 1; return origPrepare(sql); };
  return db;
}

function makeBucket() {
  const deleted = [];
  return {
    deleted,
    // 对齐 R2 真实 API：delete 接受字符串或字符串数组（≤1000 key/次），一次调用算一次操作
    delete: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) deleted.push(k);
    },
  };
}

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log("  ok    " + name); }
  catch (e) { failures.push(name + ": " + e.message); console.log("  FAIL  " + name + " — " + e.stack.split("\n")[0]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(msg + "（期望 " + JSON.stringify(expected) + "，实际 " + JSON.stringify(actual) + "）");
}

async function main() {
  build();
  const schema1x = readFileSync(join(root, "sql/schema.sql"), "utf8");
  const trash = require(join(outDir, "server/data/trash.js"));
  const nodes = require(join(outDir, "server/lib/nodes.js"));

  const now = Date.now();
  const seed = (db) => {
    // 测试夹具约定：workspace id 与 user id 相同（u1），让旧的 owner 维度用例可直接迁移
    db.prepare("INSERT INTO users (id, access_sub, name, created_at) VALUES ('u1','sub1','A',?)").run(now);
    db.prepare("INSERT INTO workspaces (id, name, slug, quota_bytes, created_at) VALUES ('u1','ws','u1',100000,?)").run(now);
    db.prepare("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES ('u1','u1','owner',?)").run(now);
    db.prepare("INSERT INTO storage_stats (workspace_id, updated_at) VALUES ('u1',?)").run(now);
  };
  // —— 软删 / 彻底删除 / 移动 / 还原 / 孤儿清扫 ——
  await check("softDeleteMany：文件夹子树整棵软删，配额按文件大小精确扣减", async () => {
    const db = makeD1(schema1x);
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    const dirRow = await nodes.createDir(db, "u1", rootId, "docs");
    const dir = dirRow.id;
    const dirPath = nodes.childPath(dirRow);
    db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES ('f1','u1','u1',?,?,'a.bin',0,'k1',100,'x',?,?)").run(dir, dirPath, now, now);
    db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES ('f2','u1','u1',?,?,'b.bin',0,'k2',50,'x',?,?)").run(dir, dirPath, now, now);
    db.prepare("UPDATE workspaces SET used_bytes = 150 WHERE id='u1'").run();
    const n = await trash.softDeleteMany(db, "u1", [dir]);
    assertEqual(n, 1, "应返回 1 个有效根");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM nodes WHERE workspace_id='u1' AND deleted_at IS NOT NULL").first().c, 3, "目录与两个文件都应软删");
    assertEqual(db.prepare("SELECT used_bytes u FROM workspaces WHERE id='u1'").first().u, 0, "配额应扣减 150");
  });

  await check("permanentDeleteMany：子树行删除、shares 清理、R2 key 全部登记待清扫", async () => {
    const db = makeD1(schema1x);
    const bucket = makeBucket();
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    const dirRow = await nodes.createDir(db, "u1", rootId, "old");
    const dir = dirRow.id;
    const dirPath = nodes.childPath(dirRow);
    db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES ('g1','u1','u1',?,?,'a.bin',0,'kk1',10,'x',?,?,?)").run(dir, dirPath, now, now, now);
    db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES ('g2','u1','u1',?,?,'b.bin',0,'kk2',10,'x',?,?,?)").run(dir, dirPath, now, now, now);
    db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = ?").run(now, dir);
    db.prepare("INSERT INTO shares (id, workspace_id, node_id, token, downloads, created_at) VALUES ('sh1','u1','g1','tok',0,?)").run(now);
    const n = await trash.permanentDeleteMany({ DB: db, BUCKET: bucket }, "u1", [dir]);
    assertEqual(n, 1, "应处理 1 个回收站根");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM nodes WHERE id IN ('g1','g2') OR id = ?").first().c === 0, true, "子树行应删除");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM shares WHERE id='sh1'").first().c, 0, "shares 应级联清理");
    const keys = db.prepare("SELECT r2_key FROM orphan_objects ORDER BY r2_key").all().results.map((r) => r.r2_key);
    assertEqual(keys, ["kk1", "kk2"], "两个对象都应登记待清扫，且不立即删 R2");
    assertEqual(bucket.deleted.length, 0, "彻底删除阶段不应直接删 R2 对象（延迟清扫）");
  });

  await check("moveMany：改名 + 子树路径前缀平移", async () => {
    const db = makeD1(schema1x);
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    const a = (await nodes.createDir(db, "u1", rootId, "A")).id;
    const b = (await nodes.createDir(db, "u1", rootId, "B")).id;
    const subRow = await nodes.createDir(db, "u1", a, "sub");
    const sub = subRow.id;
    db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES ('leaf','u1','u1',?,?,'leaf.bin',0,'kz',5,'x',?,?)").run(sub, nodes.childPath(subRow), now, now);
    const n = await trash.moveMany(db, "u1", [a], b);
    assertEqual(n, 1, "应移动 1 项");
    const moved = db.prepare("SELECT parent_id, path FROM nodes WHERE id = ?").first(a);
    assertEqual(moved.parent_id, b, "A 的父应为 B");
    const leaf = db.prepare("SELECT path FROM nodes WHERE id='leaf'").first();
    assert(moved.path === "/" + rootId + "/" + b + "/", "A 的新路径应指向 B：实际 " + moved.path);
    assert(leaf.path.startsWith(moved.path + a + "/"), "子树的 path 应整体平移到 A 的新前缀：实际 " + leaf.path);
  });

  await check("restoreTrashNode：还原加回配额，父已删则回根", async () => {
    const db = makeD1(schema1x);
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    const dirRow = await nodes.createDir(db, "u1", rootId, "keep");
    const dir = dirRow.id;
    db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES ('r1','u1','u1',?,?,'r.bin',0,'kr',40,'x',?,?,?)").run(dir, nodes.childPath(dirRow), now, now, now);
    db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = ?").run(now, dir);
    await trash.restoreTrashNode(db, "u1", "r1");
    assertEqual(db.prepare("SELECT used_bytes u FROM workspaces WHERE id='u1'").first().u, 40, "应加回 40 字节");
    const row = db.prepare("SELECT parent_id, deleted_at FROM nodes WHERE id='r1'").first();
    assertEqual(row.deleted_at, null, "应恢复为活跃");
    assertEqual(row.parent_id, rootId, "父已删 → 回根（哨兵行 id）");
  });

  await check("sweepOrphanObjects：宽限期后仅删无引用对象，有引用只出队", async () => {
    const db = makeD1(schema1x);
    const bucket = makeBucket();
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    db.prepare("INSERT INTO orphan_objects (r2_key, queued_at) VALUES ('dead1',?),('dead2',?),('alive',?)").run(now - 5000, now - 5000, now - 5000);
    db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES ('keep','u1','u1',?,'/x/','o.bin',0,'alive',1,'x',?,?)").run(rootId, now, now);
    const deleted = await trash.sweepOrphanObjects({ DB: db, BUCKET: bucket }, 0);
    assertEqual(deleted, 2, "应删 2 个无引用对象");
    assertEqual(bucket.deleted.sort(), ["dead1", "dead2"], "只删无引用的 key");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM orphan_objects").first().c, 0, "全部出队（有引用的不再跟踪）");
  });

  // —— 租户层（schema 2.0）：P1.2 的地基，先测再用 ——
    const schema2 = readFileSync(join(root, "sql/v2/schema.sql"), "utf8");
    const workspaces = require(join(outDir, "server/data/workspaces.js"));
    const seedUser2 = (db, id, sub, email) => {
      db.prepare("INSERT INTO users (id, access_sub, email, name, created_at) VALUES (?,?,?,?,?)").run(id, sub, email ?? null, id, now);
    };
  
    await check("ensurePersonalWorkspace：幂等（同一空间、单条 owner 成员、storage_stats 就位）", async () => {
      const db = makeD1(schema2);
      seedUser2(db, "u1", "sub1", "a@example.com");
      const w1 = await workspaces.ensurePersonalWorkspace(db, "u1");
      const w2 = await workspaces.ensurePersonalWorkspace(db, "u1");
      assertEqual(w1.id, w2.id, "二次调用应返回同一空间");
      assertEqual(db.prepare("SELECT COUNT(*) c FROM memberships WHERE user_id='u1'").first().c, 1, "应只有一条成员记录");
      assertEqual(db.prepare("SELECT role FROM memberships WHERE user_id='u1'").first().role, "owner", "首登应为 owner");
      assertEqual(db.prepare("SELECT COUNT(*) c FROM storage_stats WHERE workspace_id=?").first(w1.id).c, 1, "应有 storage_stats 行");
      let rejected = false;
      try { db.prepare("INSERT INTO workspaces (id, name, slug, quota_bytes, created_at) VALUES ('dup','x',?,1,?)").run(workspaces.personalSlug("u1"), now); }
      catch { rejected = true; }
      assert(rejected, "同 slug 必须被唯一索引拒绝（并发首登靠它收敛）");
    });
  
    await check("resolveWorkspace：默认空间 / 他人空间 403 / 不存在 404", async () => {
      const db = makeD1(schema2);
      seedUser2(db, "u1", "sub1");
      seedUser2(db, "u2", "sub2");
      const mine = await workspaces.ensurePersonalWorkspace(db, "u1");
      const other = await workspaces.ensurePersonalWorkspace(db, "u2");
      const def = await workspaces.resolveWorkspace(db, "u1");
      assertEqual(def.workspace.id, mine.id, "未指定时应回到自己的空间");
      assertEqual(def.role, "owner", "角色应为 owner");
      const byId = await workspaces.resolveWorkspace(db, "u1", mine.id);
      assertEqual(byId.workspace.id, mine.id, "按 id 解析应成功");
      let forbidden = null;
      try { await workspaces.resolveWorkspace(db, "u1", other.id); } catch (e) { forbidden = e; }
      assert(forbidden && forbidden.status === 403, "访问他人空间应 403，实际 " + (forbidden && forbidden.status));
      let missing = null;
      try { await workspaces.resolveWorkspace(db, "u1", "no-such-workspace"); } catch (e) { missing = e; }
      assert(missing && missing.status === 404, "不存在的空间应 404，实际 " + (missing && missing.status));
    });
  
    await check("listMemberships：多空间按加入顺序，role 正确", async () => {
      const db = makeD1(schema2);
      seedUser2(db, "u1", "sub1");
      seedUser2(db, "u2", "sub2");
      const personal = await workspaces.ensurePersonalWorkspace(db, "u1");
      const team = await workspaces.ensurePersonalWorkspace(db, "u2");
      db.prepare("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES (?,?,?,?)").run(team.id, "u1", "admin", Date.now() + 10);
      const list = await workspaces.listMemberships(db, "u1");
      assertEqual(list.length, 2, "应看到两个空间");
      assertEqual(list[0].workspace.id, personal.id, "个人空间在前（加入更早）");
      assertEqual(list[1].role, "admin", "第二个空间角色应为 admin");
    });
  
    await check("租户隔离：不同 workspace 同名文件互不冲突且互不可见", async () => {
      const db = makeD1(schema2);
      seedUser2(db, "u1", "sub1");
      seedUser2(db, "u2", "sub2");
      const w1 = await workspaces.ensurePersonalWorkspace(db, "u1");
      const w2 = await workspaces.ensurePersonalWorkspace(db, "u2");
      const mkRoot = (ws, uid) => {
        db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, created_at, updated_at) VALUES (?,?,?,'','/','',1,?,?)").run("root-" + ws, ws, uid, now, now);
        return "root-" + ws;
      };
      const r1 = mkRoot(w1.id, "u1");
      const r2 = mkRoot(w2.id, "u2");
      const mkFile = (id, ws, uid, rt, name) =>
        db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES (?,?,?,?,?,?,0,'k',1,'x',?,?)")
          .run(id, ws, uid, rt, "/" + rt + "/", name, now, now);
      mkFile("a1", w1.id, "u1", r1, "same-name.bin");
      mkFile("b1", w2.id, "u2", r2, "same-name.bin");
      const list1 = db.prepare("SELECT id FROM nodes WHERE workspace_id = ?1 AND parent_id = ?2").all(w1.id, r1).results.map((row) => row.id);
      assertEqual(list1, ["a1"], "只能看到自己空间的节点");
      let dupRejected = false;
      try { mkFile("a2", w1.id, "u1", r1, "same-name.bin"); } catch { dupRejected = true; }
      assert(dupRejected, "同空间同名必须被拒绝（部分唯一索引是 workspace 维度）");
    });
  
    // —— HTTP 层（真 Hono fetch + D1 垫片 + AUTH_MODE=dev 身份）——
  const worker = require(join(outDir, "server/index.js")).default;
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  function makeEnv(db, bucket) {
    return {
      DB: db,
      BUCKET: bucket,
      ASSETS: {},
      AUTH_MODE: "dev",
      DEV_AUTH_EMAIL: "a@example.com",
      ACCESS_PROVISION: "on",
      ACCESS_TEAM_DOMAIN: "https://test.cloudflareaccess.com",
      ACCESS_AUD: "test-aud",
      PUBLIC_URL: "https://stor.test",
      R2_ENDPOINT: "https://r2.test/mstor",
      R2_ACCESS_KEY_ID: "k",
      R2_SECRET_ACCESS_KEY: "s",
      DEFAULT_QUOTA_BYTES: "10737418240",
      SMALL_FILE_LIMIT: String(60 * 1048576),
      TRASH_RETENTION_DAYS: "30",
    };
  }
  function makeR2() {
    const store = new Map();
    return {
      store,
      put: async (key, body) => {
        const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
        store.set(key, bytes);
        return { size: bytes.byteLength, key };
      },
      get: async (key, opts) => {
        const bytes = store.get(key);
        if (!bytes) return null;
        if (opts && opts.range) {
          const offset = opts.range.offset || 0;
          const length = opts.range.length === undefined ? bytes.byteLength - offset : opts.range.length;
          return { body: bytes.slice(offset, offset + length), size: bytes.byteLength };
        }
        return { body: bytes, size: bytes.byteLength };
      },
      head: async (key) => (store.has(key) ? { size: store.get(key).byteLength } : null),
      delete: async (keys) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
      },
    };
  }
  async function call(env, path, init) {
    const req = new Request("https://stor.test" + path, init || {});
    const res = await worker.fetch(req, env, ctx);
    const buf = await res.arrayBuffer();
    const text = Buffer.from(buf).toString("utf8");
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 响应（文件内容） */ }
    return { status: res.status, json, text, bytes: Buffer.from(buf), headers: res.headers };
  }

  await check("HTTP：health 免认证 + /api/me 首登自动建号（首个用户 admin）", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const health = await call(env, "/api/health");
    assertEqual(health.status, 200, "health 应 200");
    const me = await call(env, "/api/me", { headers: { "x-dev-email": "a@example.com" } });
    assertEqual(me.status, 200, "/api/me 应 200，实际 " + me.status + " " + me.text.slice(0, 120));
    assertEqual(me.json.role, "admin", "首个建号用户应为 admin");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM users").first().c, 1, "应只建一个用户");
  });

  await check("HTTP：建目录 → 列表 → 上传 → 下载 → Range 206", async () => {
    const db = makeD1(schema1x);
    const bucket = makeR2();
    const env = makeEnv(db, bucket);
    const auth = { "x-dev-email": "a@example.com" };
    const dir = await call(env, "/api/dirs", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ parentId: "", name: "docs" }),
    });
    assertEqual(dir.status, 201, "建目录应 201，实际 " + dir.status + " " + dir.text.slice(0, 120));
    const listing = await call(env, "/api/files?parentId=", { headers: auth });
    assertEqual(listing.status, 200, "列表应 200");
    assertEqual(listing.json.nodes.length, 1, "列表应有 1 个目录");
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const up = await call(env, "/api/files/upload?name=a.bin&parentId=", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: payload,
    });
    assertEqual(up.status, 201, "上传应 201，实际 " + up.status + " " + up.text.slice(0, 160));
    const id = up.json.id;
    const dl = await call(env, "/api/files/" + id + "/content", { headers: auth });
    assertEqual(dl.status, 200, "下载应 200");
    assertEqual([...dl.bytes], [1, 2, 3, 4, 5, 6, 7, 8], "下载字节应与上传一致");
    const ranged = await call(env, "/api/files/" + id + "/content", { headers: { ...auth, range: "bytes=0-3" } });
    assertEqual(ranged.status, 206, "Range 应 206，实际 " + ranged.status);
    assertEqual([...ranged.bytes], [1, 2, 3, 4], "Range 返回前 4 字节");
    assertEqual(ranged.headers.get("content-range"), "bytes 0-3/8", "content-range 应正确");
    assertEqual(db.prepare("SELECT used_bytes u FROM workspaces WHERE slug LIKE 'u-%' ORDER BY created_at DESC LIMIT 1").first().u, 8, "配额应记为 8 字节");
  });

  await check("HTTP：批量删除 → 回收站 → 批量还原", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const auth = { "x-dev-email": "a@example.com" };
    const ids = [];
    for (const name of ["x1.bin", "x2.bin"]) {
      const up = await call(env, "/api/files/upload?name=" + name + "&parentId=", {
        method: "PUT",
        headers: { ...auth, "content-type": "application/octet-stream" },
        body: new Uint8Array([1, 2]),
      });
      ids.push(up.json.id);
    }
    const del = await call(env, "/api/files/batch-delete", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    assertEqual(del.status, 200, "批量删除应 200，实际 " + del.status + " " + del.text.slice(0, 120));
    const trash = await call(env, "/api/trash", { headers: auth });
    assertEqual(trash.json.nodes.length, 2, "回收站应有 2 项");
    const restored = await call(env, "/api/trash/batch-restore", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    assertEqual(restored.json.restored, 2, "应还原 2 项");
    const listing = await call(env, "/api/files?parentId=", { headers: auth });
    assertEqual(listing.json.nodes.length, 2, "还原后列表应有 2 项");
  });

  await check("HTTP：跨用户隔离（他人节点一律 404，列表互不可见）", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const alice = { "x-dev-email": "a@example.com" };
    const bob = { "x-dev-email": "b@example.com" };
    const up = await call(env, "/api/files/upload?name=secret.bin&parentId=", {
      method: "PUT",
      headers: { ...alice, "content-type": "application/octet-stream" },
      body: new Uint8Array([9, 9, 9]),
    });
    const nodeId = up.json.id;
    const bobList = await call(env, "/api/files?parentId=", { headers: bob });
    assertEqual(bobList.json.nodes.length, 0, "Bob 不应看到 Alice 的文件");
    const bobDl = await call(env, "/api/files/" + nodeId + "/content", { headers: bob });
    assertEqual(bobDl.status, 404, "Bob 下载 Alice 的文件应 404，实际 " + bobDl.status);
    const bobDel = await call(env, "/api/files/" + nodeId, { method: "DELETE", headers: bob });
    assertEqual(bobDel.status, 404, "Bob 删除 Alice 的文件应 404，实际 " + bobDel.status);
    assertEqual(db.prepare("SELECT deleted_at FROM nodes WHERE id = ?").first(nodeId).deleted_at, null, "Alice 的文件不应被删");
  });

  // —— 邀请与成员（P1.3）：Access 身份 + 邀请令牌 → 自动落 membership ——
  await check("HTTP：邀请 → 首登认领 → 落在邀请方空间，member 不能发邀请", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const alice = { "x-dev-email": "a@example.com" };
    const bob = { "x-dev-email": "b@example.com" };
    const meAlice = await call(env, "/api/me", { headers: alice });
    assertEqual(meAlice.status, 200, "Alice 首登应 200");
    const invite = await call(env, "/api/workspaces/invitations", {
      method: "POST",
      headers: { ...alice, "content-type": "application/json" },
      body: JSON.stringify({ email: "b@example.com", role: "member" }),
    });
    assertEqual(invite.status, 201, "发邀请应 201，实际 " + invite.status + " " + invite.text.slice(0, 160));
    assert(invite.json.token && invite.json.url, "应返回 token 与 url");
    const auditCreate = db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'invitation.create'").first().c;
    assertEqual(auditCreate, 1, "发邀请应写审计事件");
    const meBob = await call(env, "/api/me", { headers: bob });
    assertEqual(meBob.status, 200, "Bob 首登应 200（认领邀请，不建个人空间）");
    assertEqual(meBob.json.workspaces.length, 1, "Bob 应只属于邀请方空间");
    assertEqual(meBob.json.workspace.id, meAlice.json.workspace.id, "Bob 的当前空间应是 Alice 的空间");
    const accepted = db.prepare("SELECT COUNT(*) c FROM invitations WHERE accepted_at IS NOT NULL").first().c;
    assertEqual(accepted, 1, "邀请应被标记为已接受");
    const auditAccept = db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'invitation.accept'").first().c;
    assertEqual(auditAccept, 1, "认领应写审计事件");
    const asMember = await call(env, "/api/workspaces/invitations", {
      method: "POST",
      headers: { ...bob, "content-type": "application/json" },
      body: JSON.stringify({ email: "c@example.com" }),
    });
    assertEqual(asMember.status, 403, "member 发邀请应 403，实际 " + asMember.status);
    const members = await call(env, "/api/workspaces/members", { headers: alice });
    assertEqual(members.json.members.length, 2, "空间应有 2 名成员");
  });

  // —— 存储治理（P2 B1）：四分项 + 全局预算 + 507 ——
  await check("HTTP：四分项随上传/软删/还原/彻底删除变化，且与 used_bytes 一致", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const auth = { "x-dev-email": "a@example.com" };
    const up = await call(env, "/api/files/upload?name=s.bin&parentId=", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    });
    assertEqual(up.status, 201, "上传应 201");
    const id = up.json.id;
    const stat = () => db.prepare("SELECT active_bytes a, trash_bytes t FROM storage_stats").first();
    assertEqual(stat().a, 8, "上传后 active_bytes 应为 8");
    assertEqual(stat().t, 0, "上传后 trash_bytes 应为 0");
    const me = await call(env, "/api/me", { headers: auth });
    assertEqual(me.json.storage.activeBytes, 8, "/api/me 应返回 activeBytes");
    assertEqual(me.json.storage.level, "ok", "水位应为 ok");
    await call(env, "/api/files/" + id, { method: "DELETE", headers: auth });
    assertEqual(stat().a, 0, "软删后 active 归零");
    assertEqual(stat().t, 8, "软删后 trash 应为 8");
    const restored = await call(env, "/api/trash/" + id + "/restore", { method: "POST", headers: auth });
    assertEqual(restored.status, 200, "还原应 200，实际 " + restored.status + " " + restored.text.slice(0, 200));
    assertEqual(stat().a, 8, "还原后 active 回到 8");
    assertEqual(stat().t, 0, "还原后 trash 归零");
    await call(env, "/api/trash/batch-purge", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    await call(env, "/api/files/" + id, { method: "DELETE", headers: auth });
    await call(env, "/api/trash/batch-purge", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    assertEqual(stat().a, 0, "彻底删除后 active 为 0");
    assertEqual(stat().t, 0, "彻底删除后 trash 为 0");
  });

  await check("HTTP：全局预算超限返回 507 STORAGE_FULL（与个人配额 403 区分）", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const auth = { "x-dev-email": "a@example.com" };
    await call(env, "/api/me", { headers: auth }); // 建号 + 个人空间
    db.prepare("INSERT INTO settings (key, value) VALUES ('global_quota_bytes', '10')").run();
    const res = await call(env, "/api/files/upload?name=big.bin&parentId=", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: new Uint8Array(20),
    });
    assertEqual(res.status, 507, "超出整站预算应 507，实际 " + res.status + " " + res.text.slice(0, 120));
    assertEqual(res.json.error.code, "STORAGE_FULL", "错误码应为 STORAGE_FULL");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM nodes WHERE name = 'big.bin'").first().c, 0, "被拒上传不应留下节点");
  });

  // —— 分享 2.0（P2 B3）：原子名额 + Range/预览不计数 + 去重 ——
  await check("HTTP：分享下载上限原子扣减（max=1 第二次 410）且 Range/预览不计数", async () => {
    const db = makeD1(schema1x);
    const bucket = makeR2();
    const env = makeEnv(db, bucket);
    const auth = { "x-dev-email": "a@example.com" };
    const up = await call(env, "/api/files/upload?name=shared.bin&parentId=", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    });
    const nodeId = up.json.id;
    const created = await call(env, "/api/shares", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ nodeId, maxDownloads: 1 }),
    });
    assertEqual(created.status, 201, "创建分享应 201，实际 " + created.status + " " + created.text.slice(0, 160));
    const token = created.json.token;
    const raw = (query, headers) => call(env, "/api/s/" + token + "/raw/" + nodeId + (query || ""), { headers });
    // 预览（无 dl）不计数
    const preview = await raw("", { "user-agent": "preview-agent" });
    assertEqual(preview.status, 200, "预览应 200");
    // Range 分段（拖进度条）不计数
    const r1 = await raw("?dl=1", { "user-agent": "player", range: "bytes=0-1" });
    const r2 = await raw("?dl=1", { "user-agent": "player", range: "bytes=2-3" });
    assertEqual(r1.status, 206, "Range 应 206，实际 " + r1.status);
    assertEqual(r2.status, 206, "第二次 Range 仍应 206，实际 " + r2.status);
    assertEqual(db.prepare("SELECT downloads d FROM shares WHERE token = ?").first(token).d, 0, "Range/预览不应计数");
    // 真正的下载意图：第一次成功，第二次（换 UA 跳过去重）名额已用尽
    const d1 = await raw("?dl=1", { "user-agent": "dl-one" });
    assertEqual(d1.status, 200, "首次下载应 200，实际 " + d1.status + " " + d1.text.slice(0, 120));
    const d2 = await raw("?dl=1", { "user-agent": "dl-two" });
    assertEqual(d2.status, 410, "名额用尽应 410，实际 " + d2.status);
    assertEqual(d2.json.error.code, "SHARE_EXHAUSTED", "错误码应为 SHARE_EXHAUSTED");
    assertEqual(db.prepare("SELECT downloads d FROM shares WHERE token = ?").first(token).d, 1, "下载次数应恰好为 1");
  });

  await check("HTTP：同来源 10 分钟内重复下载只计一次（dedupe），撤销后 404", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const auth = { "x-dev-email": "a@example.com" };
    const up = await call(env, "/api/files/upload?name=dedupe.bin&parentId=", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: new Uint8Array([9, 9]),
    });
    const nodeId = up.json.id;
    const created = await call(env, "/api/shares", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ nodeId, maxDownloads: 5 }),
    });
    const token = created.json.token;
    const headers = { "user-agent": "same-agent", "cf-connecting-ip": "1.2.3.4" };
    const url = "/api/s/" + token + "/raw/" + nodeId + "?dl=1";
    await call(env, url, { headers });
    await call(env, url, { headers });
    assertEqual(db.prepare("SELECT downloads d FROM shares WHERE token = ?").first(token).d, 1, "同来源重复下载只计一次");
    const list = await call(env, "/api/shares", { headers: auth });
    const shareId = list.json.shares[0].id;
    await call(env, "/api/shares/" + shareId, { method: "DELETE", headers: auth });
    const afterRevoke = await call(env, url, { headers });
    assertEqual(afterRevoke.status, 404, "撤销后应 404，实际 " + afterRevoke.status);
  });

  // —— 文件名检索 2.0（P2 B8）：服务端过滤 + 排序 + 分页 ——
  await check("HTTP：检索支持类型/大小过滤、按大小排序与游标分页", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const auth = { "x-dev-email": "a@example.com" };
    const upload = async (name, bytes) => {
      const res = await call(env, "/api/files/upload?name=" + encodeURIComponent(name) + "&parentId=", {
        method: "PUT",
        headers: { ...auth, "content-type": "application/octet-stream" },
        body: new Uint8Array(bytes),
      });
      assertEqual(res.status, 201, "上传 " + name + " 应 201，实际 " + res.status);
      return res.json.id;
    };
    await upload("report-small.bin", 4);
    await upload("report-mid.bin", 8);
    await upload("report-big.bin", 12);
    const dir = await call(env, "/api/dirs", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ parentId: "", name: "report-dir" }),
    });
    assertEqual(dir.status, 201, "建目录应 201");
    const search = (qs) => call(env, "/api/search?q=report" + qs, { headers: auth });
    const all = await search("");
    assertEqual(all.status, 200, "检索应 200");
    assertEqual(all.json.nodes.length, 4, "应命中 4 项（3 文件 + 1 目录）");
    const dirsOnly = await search("&type=dir");
    assertEqual(dirsOnly.json.nodes.length, 1, "type=dir 应只命中目录");
    const bigOnly = await search("&type=file&min=8");
    assertEqual(bigOnly.json.nodes.length, 2, "min=8 应命中 2 个文件");
    const bySize = await search("&type=file&sort=size&limit=2");
    assertEqual(bySize.json.nodes.length, 2, "第一页应有 2 项");
    assertEqual(bySize.json.nodes[0].size, 12, "按大小降序首项应为 12");
    assert(bySize.json.nextCursor && bySize.json.nextCursor.startsWith("o:"), "偏移游标应返回 o:N，实际 " + bySize.json.nextCursor);
    const page2 = await call(env, "/api/search?q=report&type=file&sort=size&limit=2&cursor=" + encodeURIComponent(bySize.json.nextCursor), { headers: auth });
    assertEqual(page2.json.nodes.length, 1, "第二页应有 1 项");
    assertEqual(page2.json.nextCursor, null, "第二页后不应再有游标");
    const firstPage = await search("&limit=2");
    assert(firstPage.json.nextCursor && firstPage.json.nextCursor.startsWith("u:"), "recent 排序应返回 keyset 游标");
    const secondPage = await call(env, "/api/search?q=report&limit=2&cursor=" + encodeURIComponent(firstPage.json.nextCursor), { headers: auth });
    const firstIds = firstPage.json.nodes.map((n) => n.id);
    const secondIds = secondPage.json.nodes.map((n) => n.id);
    assertEqual(secondIds.filter((id) => firstIds.includes(id)).length, 0, "两页不应重叠");
    assertEqual(firstIds.length + secondIds.length, 4, "两页合计应覆盖全部 4 项");
  });

  // —— 管理台聚合（P2 B10）——
  await check("HTTP：/api/me/admin/overview 聚合人/空间/审计，且非平台管理员 403", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const alice = { "x-dev-email": "a@example.com" };
    const bob = { "x-dev-email": "b@example.com" };
    await call(env, "/api/me", { headers: alice });
    const invite = await call(env, "/api/workspaces/invitations", {
      method: "POST",
      headers: { ...alice, "content-type": "application/json" },
      body: JSON.stringify({ email: "b@example.com", role: "member" }),
    });
    assertEqual(invite.status, 201, "发邀请应 201");
    await call(env, "/api/me", { headers: bob });
    const ov = await call(env, "/api/me/admin/overview", { headers: alice });
    assertEqual(ov.status, 200, "平台管理员应 200，实际 " + ov.status + " " + ov.text.slice(0, 160));
    assertEqual(ov.json.users.total, 2, "应统计到 2 个用户");
    assertEqual(ov.json.workspaces.total, 1, "应只有 1 个空间（Bob 加入 Alice 的空间）");
    assertEqual(ov.json.topWorkspaces[0].members, 2, "空间成员应为 2");
    assert(ov.json.recentAudit.length >= 2, "审计应至少含邀请创建/接受两条，实际 " + ov.json.recentAudit.length);
    const forbidden = await call(env, "/api/me/admin/overview", { headers: bob });
    assertEqual(forbidden.status, 403, "普通成员访问应 403，实际 " + forbidden.status);
  });

  // —— 复制与撤销（P2 B9）——
  await check("HTTP：复制文件/目录（共享 R2 对象、配额按逻辑字节翻倍）", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const auth = { "x-dev-email": "a@example.com" };
    const up = await call(env, "/api/files/upload?name=x.bin&parentId=", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    });
    const fileId = up.json.id;
    const copy = await call(env, "/api/files/" + fileId + "/copy", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ parentId: "" }),
    });
    assertEqual(copy.status, 201, "复制应 201，实际 " + copy.status + " " + copy.text.slice(0, 160));
    assertEqual(copy.json.name, "x (2).bin", "同名复制应自动让位，实际 " + copy.json.name);
    const keys = db.prepare("SELECT DISTINCT r2_key FROM nodes WHERE name LIKE 'x%.bin'").all().results;
    assertEqual(keys.length, 1, "两个副本应共享同一个 R2 对象");
    assertEqual(db.prepare("SELECT used_bytes u FROM workspaces").first().u, 16, "配额按逻辑字节翻倍（16）");
    const dir = await call(env, "/api/dirs", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ parentId: "", name: "d" }),
    });
    await call(env, "/api/files/upload?name=inner.bin&parentId=" + dir.json.id, {
      method: "PUT",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: new Uint8Array([7, 7]),
    });
    const dirCopy = await call(env, "/api/files/" + dir.json.id + "/copy", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ parentId: "" }),
    });
    assertEqual(dirCopy.json.copied, 2, "目录复制应含自身 + 1 个子项");
    const child = db.prepare("SELECT path FROM nodes WHERE id IN (SELECT id FROM nodes WHERE name = 'inner.bin' AND id != ?) LIMIT 1").first(copy.json.id);
    assert(child && child.path.startsWith("/" + dir.json.id + "/") === false, "副本应在新的目录路径下");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM nodes WHERE name = 'd (2)'").first().c, 1, "副本目录应让位为 d (2)");
  });

  await check("HTTP：移动后 30 秒内可撤销（过期 410、重复撤销 409）", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const auth = { "x-dev-email": "a@example.com" };
    const up = await call(env, "/api/files/upload?name=move-me.bin&parentId=", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: new Uint8Array([1]),
    });
    const fileId = up.json.id;
    const dir = await call(env, "/api/dirs", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ parentId: "", name: "target" }),
    });
    const moved = await call(env, "/api/files/" + fileId, {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ parentId: dir.json.id }),
    });
    assertEqual(moved.status, 200, "移动应 200");
    assert(moved.json.undoId, "移动应返回 undoId");
    assertEqual(db.prepare("SELECT parent_id p FROM nodes WHERE id = ?").first(fileId).p, dir.json.id, "移动后父应为目标目录");
    const undo = await call(env, "/api/files/operations/" + moved.json.undoId + "/undo", { method: "POST", headers: auth });
    assertEqual(undo.status, 200, "撤销应 200，实际 " + undo.status + " " + undo.text.slice(0, 160));
    const back = db.prepare("SELECT parent_id p, name n FROM nodes WHERE id = ?").first(fileId);
    assertEqual(back.n, "move-me.bin", "撤销后名称应还原");
    assert(back.p !== dir.json.id, "撤销后不应仍在目标目录");
    const again = await call(env, "/api/files/operations/" + moved.json.undoId + "/undo", { method: "POST", headers: auth });
    assertEqual(again.status, 409, "重复撤销应 409，实际 " + again.status);
    // 过期：把窗口改到过去
    const moved2 = await call(env, "/api/files/" + fileId, {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ parentId: dir.json.id }),
    });
    db.prepare("UPDATE operations SET expires_at = 1 WHERE id = ?").run(moved2.json.undoId);
    const expired = await call(env, "/api/files/operations/" + moved2.json.undoId + "/undo", { method: "POST", headers: auth });
    assertEqual(expired.status, 410, "过期撤销应 410，实际 " + expired.status);
  });

  // —— 收藏与最近访问（P2 B7）——
  await check("HTTP：收藏增删 + 最近访问 5 分钟节流 + 跨租户 404", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const alice = { "x-dev-email": "a@example.com" };
    const bob = { "x-dev-email": "b@example.com" };
    const up = await call(env, "/api/files/upload?name=fav.bin&parentId=", {
      method: "PUT",
      headers: { ...alice, "content-type": "application/octet-stream" },
      body: new Uint8Array([1, 2]),
    });
    const nodeId = up.json.id;
    const fav = await call(env, "/api/library/favorites/" + nodeId, { method: "PUT", headers: alice });
    assertEqual(fav.status, 200, "收藏应 200，实际 " + fav.status + " " + fav.text.slice(0, 120));
    const list = await call(env, "/api/library/favorites", { headers: alice });
    assertEqual(list.json.nodes.length, 1, "收藏列表应有 1 项");
    // 幂等：重复收藏不报错也不重复
    await call(env, "/api/library/favorites/" + nodeId, { method: "PUT", headers: alice });
    assertEqual(db.prepare("SELECT COUNT(*) c FROM favorites").first().c, 1, "重复收藏应幂等");
    // 最近访问：同一节点连点两次只写一次
    await call(env, "/api/library/views/" + nodeId, { method: "POST", headers: alice });
    const firstView = db.prepare("SELECT viewed_at v FROM node_views").first().v;
    await call(env, "/api/library/views/" + nodeId, { method: "POST", headers: alice });
    assertEqual(db.prepare("SELECT viewed_at v FROM node_views").first().v, firstView, "5 分钟内重复访问不应写库");
    const recent = await call(env, "/api/library/recent", { headers: alice });
    assertEqual(recent.json.nodes.length, 1, "最近列表应有 1 项");
    // 跨租户：Bob 拿 Alice 的节点 id
    const bobFav = await call(env, "/api/library/favorites/" + nodeId, { method: "PUT", headers: bob });
    assertEqual(bobFav.status, 404, "跨租户收藏应 404，实际 " + bobFav.status);
    const bobView = await call(env, "/api/library/views/" + nodeId, { method: "POST", headers: bob });
    assertEqual(bobView.status, 404, "跨租户记录访问应 404，实际 " + bobView.status);
    // 取消收藏
    await call(env, "/api/library/favorites/" + nodeId, { method: "DELETE", headers: alice });
    const after = await call(env, "/api/library/favorites", { headers: alice });
    assertEqual(after.json.nodes.length, 0, "取消收藏后列表应为空");
  });

  // —— 标签（P2 B7 收尾）——
  await check("HTTP：标签创建/重名 409/打标签/按标签列节点/解绑/跨租户 404", async () => {
    const db = makeD1(schema1x);
    const env = makeEnv(db, makeR2());
    const alice = { "x-dev-email": "a@example.com" };
    const bob = { "x-dev-email": "b@example.com" };
    const up = await call(env, "/api/files/upload?name=tagged.bin&parentId=", {
      method: "PUT",
      headers: { ...alice, "content-type": "application/octet-stream" },
      body: new Uint8Array([3, 3, 3]),
    });
    const nodeId = up.json.id;
    const created = await call(env, "/api/library/tags", {
      method: "POST",
      headers: { ...alice, "content-type": "application/json" },
      body: JSON.stringify({ name: "重要", color: "#ff0000" }),
    });
    assertEqual(created.status, 201, "建标签应 201，实际 " + created.status + " " + created.text.slice(0, 120));
    const tagId = created.json.id;
    const dup = await call(env, "/api/library/tags", {
      method: "POST",
      headers: { ...alice, "content-type": "application/json" },
      body: JSON.stringify({ name: "重要" }),
    });
    assertEqual(dup.status, 409, "同名标签应 409，实际 " + dup.status);
    const attach = await call(env, "/api/library/tags/" + tagId + "/nodes/" + nodeId, { method: "PUT", headers: alice });
    assertEqual(attach.status, 200, "打标签应 200");
    const list = await call(env, "/api/library/tags", { headers: alice });
    assertEqual(list.json.tags[0].nodes, 1, "标签应关联 1 个节点");
    const tagged = await call(env, "/api/library/tags/" + tagId + "/nodes", { headers: alice });
    assertEqual(tagged.json.nodes.length, 1, "按标签应查到 1 个节点");
    assertEqual(tagged.json.nodes[0].id, nodeId, "查到的应是该节点");
    const bobAttach = await call(env, "/api/library/tags/" + tagId + "/nodes/" + nodeId, { method: "PUT", headers: bob });
    assertEqual(bobAttach.status, 404, "跨租户打标签应 404，实际 " + bobAttach.status);
    const detach = await call(env, "/api/library/tags/" + tagId + "/nodes/" + nodeId, { method: "DELETE", headers: alice });
    assertEqual(detach.status, 200, "解绑应 200");
    const after = await call(env, "/api/library/tags/" + tagId + "/nodes", { headers: alice });
    assertEqual(after.json.nodes.length, 0, "解绑后应为空");
    const del = await call(env, "/api/library/tags/" + tagId, { method: "DELETE", headers: alice });
    assertEqual(del.status, 200, "删标签应 200");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM tags").first().c, 0, "标签应已删除");
  });

  // —— 语句数预算（§4.6）：大批量下语句数必须与批次无关 ——
  await check("200 项批量：软删 ≤4 条语句、彻底删除 ≤5 条语句", async () => {
    const db = makeD1(schema1x);
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    const ids = [];
    const ins = db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 200; i += 1) {
      const id = "big-" + i;
      ids.push(id);
      ins.run(id, "u1", "u1", rootId, "/" + rootId + "/", "big-" + i + ".bin", 0, "kb" + i, 10, "x", now, now);
    }
    db._sql = 0;
    await trash.softDeleteMany(db, "u1", ids);
    const softSql = db._sql;
    db._sql = 0;
    await trash.permanentDeleteMany({ DB: db, BUCKET: makeBucket() }, "u1", ids);
    const permSql = db._sql;
    assert(softSql <= 4, "软删 200 项语句数应 ≤4，实际 " + softSql);
    assert(permSql <= 5, "彻底删除 200 项语句数应 ≤5，实际 " + permSql);
    console.log("        实测语句数：软删 " + softSql + " 条 / 彻底删除 " + permSql + " 条（旧实现约 41 / 535）");
  });

  console.log("\n" + (failures.length === 0 ? "全部通过：" + passed + " 项" : "失败 " + failures.length + " 项：\n" + failures.join("\n")));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
