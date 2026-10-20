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
  const trash = require(join(outDir, "server/routes/trash.js"));
  const nodes = require(join(outDir, "server/lib/nodes.js"));

  const now = Date.now();
  const seed = (db) => {
    db.prepare("INSERT INTO users (id, access_sub, name, role, quota_bytes, created_at) VALUES ('u1','sub1','A','member',100000,?)").run(now);
    const rootId = nodes.ensureRootDir ? null : null;
    return rootId;
  };

  // —— 软删 / 彻底删除 / 移动 / 还原 / 孤儿清扫 ——
  await check("softDeleteMany：文件夹子树整棵软删，配额按文件大小精确扣减", async () => {
    const db = makeD1(schema1x);
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    const dirRow = await nodes.createDir(db, "u1", rootId, "docs");
    const dir = dirRow.id;
    const dirPath = nodes.childPath(dirRow);
    db.prepare("INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES ('f1','u1',?,?,'a.bin',0,'k1',100,'x',?,?)").run(dir, dirPath, now, now);
    db.prepare("INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES ('f2','u1',?,?,'b.bin',0,'k2',50,'x',?,?)").run(dir, dirPath, now, now);
    db.prepare("UPDATE users SET used_bytes = 150 WHERE id='u1'").run();
    const n = await trash.softDeleteMany(db, "u1", [dir]);
    assertEqual(n, 1, "应返回 1 个有效根");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM nodes WHERE owner_id='u1' AND deleted_at IS NOT NULL").first().c, 3, "目录与两个文件都应软删");
    assertEqual(db.prepare("SELECT used_bytes u FROM users WHERE id='u1'").first().u, 0, "配额应扣减 150");
  });

  await check("permanentDeleteMany：子树行删除、shares 清理、R2 key 全部登记待清扫", async () => {
    const db = makeD1(schema1x);
    const bucket = makeBucket();
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    const dirRow = await nodes.createDir(db, "u1", rootId, "old");
    const dir = dirRow.id;
    const dirPath = nodes.childPath(dirRow);
    db.prepare("INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES ('g1','u1',?,?,'a.bin',0,'kk1',10,'x',?,?,?)").run(dir, dirPath, now, now, now);
    db.prepare("INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES ('g2','u1',?,?,'b.bin',0,'kk2',10,'x',?,?,?)").run(dir, dirPath, now, now, now);
    db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = ?").run(now, dir);
    db.prepare("INSERT INTO shares (id, node_id, token, downloads, created_at) VALUES ('sh1','g1','tok',0,?)").run(now);
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
    db.prepare("INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES ('leaf','u1',?,?,'leaf.bin',0,'kz',5,'x',?,?)").run(sub, nodes.childPath(subRow), now, now);
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
    db.prepare("INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES ('r1','u1',?,?,'r.bin',0,'kr',40,'x',?,?,?)").run(dir, nodes.childPath(dirRow), now, now, now);
    db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = ?").run(now, dir);
    await trash.restoreTrashNode(db, "u1", "r1");
    assertEqual(db.prepare("SELECT used_bytes u FROM users WHERE id='u1'").first().u, 40, "应加回 40 字节");
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
    db.prepare("INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES ('keep','u1',?,'/x/','o.bin',0,'alive',1,'x',?,?)").run(rootId, now, now);
    const deleted = await trash.sweepOrphanObjects({ DB: db, BUCKET: bucket }, 0);
    assertEqual(deleted, 2, "应删 2 个无引用对象");
    assertEqual(bucket.deleted.sort(), ["dead1", "dead2"], "只删无引用的 key");
    assertEqual(db.prepare("SELECT COUNT(*) c FROM orphan_objects").first().c, 0, "全部出队（有引用的不再跟踪）");
  });

  // —— 语句数预算（§4.6）：大批量下语句数必须与批次无关 ——
  await check("200 项批量：软删 ≤4 条语句、彻底删除 ≤5 条语句", async () => {
    const db = makeD1(schema1x);
    seed(db);
    const rootId = (await nodes.ensureRootDir(db, "u1")).id;
    const ids = [];
    const ins = db.prepare("INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 200; i += 1) {
      const id = "big-" + i;
      ids.push(id);
      ins.run(id, "u1", rootId, "/" + rootId + "/", "big-" + i + ".bin", 0, "kb" + i, 10, "x", now, now);
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
